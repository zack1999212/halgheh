"""End-to-end validation of the task module against a REAL PostgreSQL.

Run with an explicit, isolated DATABASE_URL:

    docker exec -e DATABASE_URL=postgresql+psycopg2://halgheh:halgheh@task-test-db:5432/halgheh_test \\
        -e TASK_VALIDATE_ALLOW_REAL_DB=1 \\
        halgheh-dev-backend-1 python service/task/tests/validate_postgres.py

SAFETY: the script REFUSES to run unless
  * ``DATABASE_URL`` is explicitly set in the environment, AND
  * ``TASK_VALIDATE_ALLOW_REAL_DB=1`` is set (explicit opt-in), AND
  * the database name contains ``test`` or ``validate``.
This protects the developer's shared database from accidental runs. The
database must already have the full migration chain applied
(``alembic upgrade head``) — the schema checks below introspect the real
migration output, not ``Base.metadata``.

What it validates, section by section:
  1. Schema introspection — tables, FK ``ON DELETE`` rules, unique indexes,
     CHECK constraints and performance indexes exactly as migration 017
     created them in Postgres.
  2. Functional lifecycle — every business rule exercised through the
     service layer against real Postgres semantics (constraints, FKs,
     transactions): CRUD, per-field activity, status transitions with the
     ``completed_at`` invariant, assignment lifecycle + reactivation,
     subtask hierarchy + cycle rejection, comments, labels, hard-delete
     cascade/SET NULL behavior, filtering/pagination/sorting, statistics,
     and IDOR/cross-user isolation.
  3. Response-model validation — service output is round-tripped through
     the actual Pydantic response models (what FastAPI would serialize).
  4. Concurrency — a duplicate assignment committed from two sessions;
     the loser must surface as the intended HTTP 409, never a raw 500.

Exit code 0 = all checks passed.
"""

from __future__ import annotations

import os
import sys
import threading
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import fastapi  # noqa: E402
from sqlalchemy import select, func  # noqa: E402
from sqlalchemy.exc import IntegrityError  # noqa: E402

import service.auth.models  # noqa: F401,E402  (registers users)
import service.task.models  # noqa: F401,E402
# ``User`` declares relationships to other modules' models; SQLAlchemy needs
# those classes registered before the first User is instantiated. Importing
# them here does NOT modify those modules.
import service.calendar.models.calendar  # noqa: F401,E402
import service.ai.models.credential  # noqa: F401,E402
import service.agent.models.message  # noqa: F401,E402
import service.notifications.models.notification  # noqa: F401,E402
import service.notifications.models.notification_preference  # noqa: F401,E402
from service.auth.models import User  # noqa: E402
from service.core.database import SessionLocal  # noqa: E402  (binds to DATABASE_URL)
from service.task import service as task_service  # noqa: E402
from service.task.models import (  # noqa: E402
    Task,
    TaskActivity,
    TaskAssignment,
    TaskComment,
)
from service.task.schemas import (  # noqa: E402
    SubtaskCreate,
    TaskActivityListResponse,
    TaskCommentCreate,
    TaskCommentListResponse,
    TaskCommentOut,
    TaskCreate,
    TaskFilter,
    TaskLabelCreate,
    TaskLabelListResponse,
    TaskLabelOut,
    TaskListResponse,
    TaskParentUpdate,
    TaskResponse,
    TaskStatisticsOut,
    TaskStatusUpdate,
    TaskUpdate,
)

TABLES = (
    "tasks",
    "task_assignments",
    "task_comments",
    "task_activities",
    "task_labels",
    "task_label_assignments",
)

EXPECTED_FKS = {
    # (table, column, referenced_table): ondelete
    ("tasks", "parent_task_id", "tasks"): "SET NULL",
    ("tasks", "created_by", "users"): "CASCADE",
    ("task_assignments", "task_id", "tasks"): "CASCADE",
    ("task_assignments", "assigned_user_id", "users"): "CASCADE",
    ("task_assignments", "assigned_by", "users"): "CASCADE",
    ("task_comments", "task_id", "tasks"): "CASCADE",
    ("task_comments", "user_id", "users"): "CASCADE",
    ("task_activities", "task_id", "tasks"): "SET NULL",
    ("task_activities", "actor_id", "users"): "SET NULL",
    ("task_labels", "created_by", "users"): "CASCADE",
    ("task_label_assignments", "task_id", "tasks"): "CASCADE",
    ("task_label_assignments", "label_id", "task_labels"): "CASCADE",
}

EXPECTED_UNIQUE_INDEXES = {
    "uq_task_assignments_task_user": ("task_id", "assigned_user_id"),
    "uq_task_labels_creator_name": ("created_by", "name"),
    "uq_task_label_assignments_task_label": ("task_id", "label_id"),
}

EXPECTED_CHECKS = {
    "tasks": {
        "ck_tasks_status",
        "ck_tasks_priority",
        "ck_tasks_title_not_empty",
        "ck_tasks_completed_state",
        "ck_tasks_date_order",
        "ck_tasks_parent_not_self",
    },
    "task_assignments": {"ck_task_assignments_status"},
    "task_labels": {"ck_task_labels_name_not_empty", "ck_task_labels_color_format"},
}

EXPECTED_INDEXES = {
    "tasks": {"ix_tasks_created_by", "ix_tasks_created_by_status",
              "ix_tasks_due_date", "ix_tasks_parent_task_id"},
    "task_assignments": {"ix_task_assignments_task_id",
                         "ix_task_assignments_assigned_user_id"},
    "task_comments": {"ix_task_comments_task_id", "ix_task_comments_task_created"},
    "task_activities": {"ix_task_activities_task_created",
                        "ix_task_activities_actor_id"},
    "task_labels": {"ix_task_labels_created_by"},
    "task_label_assignments": {"ix_task_label_assignments_label_id"},
}


# ---------------------------------------------------------------------------
# Tiny check harness
# ---------------------------------------------------------------------------

RESULTS: list[tuple[str, bool, str]] = []


def check(name: str, fn) -> None:
    try:
        fn()
    except Exception:
        RESULTS.append((name, False, traceback.format_exc()))
        print(f"  FAIL {name}")
    else:
        RESULTS.append((name, True, ""))
        print(f"  PASS {name}")


def section(title: str) -> None:
    print(f"\n{'=' * 72}\n{title}\n{'=' * 72}")


def expect(cond: bool, message: str) -> None:
    if not cond:
        raise AssertionError(message)


def raises_http(status_code: int, fn, *args, **kwargs) -> fastapi.HTTPException:
    try:
        fn(*args, **kwargs)
    except fastapi.HTTPException as exc:
        expect(exc.status_code == status_code,
               f"expected HTTP {status_code}, got {exc.status_code}: {exc.detail}")
        return exc
    raise AssertionError(f"expected HTTP {status_code}, no exception raised")


def raises_validation(ctor, **kwargs) -> None:
    """Payload validation happens in the Pydantic schema (the router turns
    it into HTTP 422); constructing with an invalid payload must raise."""
    import pydantic
    try:
        ctor(**kwargs)
    except pydantic.ValidationError:
        return
    raise AssertionError(f"{ctor.__name__} accepted invalid payload {kwargs}")


# ---------------------------------------------------------------------------
# Section 1 — schema introspection (real migration output)
# ---------------------------------------------------------------------------

def run_schema_checks() -> None:
    section("1. SCHEMA INTROSPECTION (real PostgreSQL, migration 017 output)")
    db = SessionLocal()

    def _scalar(sql, params=None):
        from sqlalchemy import text
        return db.execute(text(sql), params or {}).scalar()

    def tables_exist():
        for table in ("users",) + TABLES:
            n = _scalar(
                "SELECT count(*) FROM information_schema.tables "
                "WHERE table_schema = current_schema() AND table_name = :t",
                {"t": table},
            )
            expect(n == 1, f"table {table!r} missing")

    def fk_delete_rules():
        from sqlalchemy import text
        rows = db.execute(text(
            "SELECT kcu.table_name, kcu.column_name, ccu.table_name AS ref, "
            "       rc.delete_rule "
            "FROM information_schema.referential_constraints rc "
            "JOIN information_schema.key_column_usage kcu "
            "  ON kcu.constraint_name = rc.constraint_name "
            " AND kcu.constraint_schema = rc.constraint_schema "
            "JOIN information_schema.constraint_column_usage ccu "
            "  ON ccu.constraint_name = rc.constraint_name "
            " AND ccu.constraint_schema = rc.constraint_schema "
            "WHERE rc.constraint_schema = current_schema()"
        )).all()
        found = {(r[0], r[1], r[2]): r[3] for r in rows}
        for key, rule in EXPECTED_FKS.items():
            actual = found.get(key)
            expect(actual == rule,
                   f"FK {key}: expected ON DELETE {rule}, found {actual!r}")

    def unique_indexes():
        from sqlalchemy import text
        for name, columns in EXPECTED_UNIQUE_INDEXES.items():
            row = db.execute(
                text(
                    "SELECT indexdef FROM pg_indexes "
                    "WHERE schemaname = current_schema() AND indexname = :n"
                ),
                {"n": name},
            ).first()
            expect(row is not None, f"unique index {name!r} missing")
            idxdef = row[0]
            expect("UNIQUE" in idxdef.upper(), f"{name} is not UNIQUE")
            for col in columns:
                expect(f"({col}" in idxdef or f", {col}" in idxdef,
                       f"{name}: column {col!r} not in {idxdef}")

    def check_constraints():
        from sqlalchemy import text
        rows = db.execute(text(
            "SELECT conrelid::regclass::text AS tbl, conname "
            "FROM pg_constraint WHERE contype = 'c'"
        )).all()
        by_table: dict[str, set[str]] = {}
        for tbl, name in rows:
            tbl = tbl.split(".")[-1]
            by_table.setdefault(tbl, set()).add(name)
        for table, names in EXPECTED_CHECKS.items():
            actual = by_table.get(table, set())
            for name in names:
                expect(name in actual, f"CHECK {name!r} missing on {table}")

    def perf_indexes():
        from sqlalchemy import text
        rows = db.execute(text(
            "SELECT indexname FROM pg_indexes WHERE schemaname = current_schema()"
        )).all()
        names = {r[0] for r in rows}
        for table, expected in EXPECTED_INDEXES.items():
            for name in expected:
                expect(name in names, f"index {name!r} missing on {table}")

    for name, fn in (
        ("tables_exist", tables_exist),
        ("fk_delete_rules", fk_delete_rules),
        ("unique_indexes", unique_indexes),
        ("check_constraints", check_constraints),
        ("performance_indexes", perf_indexes),
    ):
        check(name, fn)
    db.close()


# ---------------------------------------------------------------------------
# Shared helpers for the functional sections
# ---------------------------------------------------------------------------

def make_user(db, username: str) -> User:
    user = User(username=username, name=username.title(), hashed_password="x")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# ---------------------------------------------------------------------------
# Section 2 — functional lifecycle on real Postgres
# ---------------------------------------------------------------------------

def run_functional_checks() -> None:
    section("2. FUNCTIONAL LIFECYCLE (service layer on real PostgreSQL)")
    db = SessionLocal()

    owner = make_user(db, "pg_owner")
    helper = make_user(db, "pg_helper")
    stranger = make_user(db, "pg_stranger")

    def crud_and_activity():
        task = task_service.create_task(
            db, owner.id, TaskCreate(title="PG task", priority="high")
        )
        expect(task.status == "todo" and task.created_by == owner.id, "defaults")
        raises_validation(TaskCreate, title="   ")
        raises_validation(TaskCreate, title="x", priority="critical")
        raises_validation(TaskCreate, title="x", due_date="2026-01-01",
                          start_date="2026-12-31")

        updated = task_service.update_task(
            db, owner.id, task.id,
            TaskUpdate(title="PG task v2", priority="urgent"),
        )
        expect(updated.title == "PG task v2" and updated.priority == "urgent",
               "update applied")
        raises_validation(TaskUpdate, status="done")  # extra="forbid"
        actions = [e.action for e in db.scalars(
            select(TaskActivity).where(TaskActivity.task_id == task.id))]
        # title changes share the generic 'task_updated' action; only
        # priority/dates have dedicated audit actions (_FIELD_ACTIONS).
        expect("task_created" in actions and "task_updated" in actions
               and "priority_changed" in actions, f"activity: {actions}")

    def status_rules():
        task = task_service.create_task(db, owner.id, TaskCreate(title="Status"))
        done = task_service.set_task_status(db, owner.id, task.id, "done")
        expect(done.status == "done" and done.completed_at is not None,
               "completed_at set")
        raises_http(400, task_service.set_task_status, db, owner.id,
                    task.id, "blocked")
        same = task_service.set_task_status(db, owner.id, task.id, "done")
        expect(same.completed_at is not None, "same-status idempotent")
        reopened = task_service.set_task_status(db, owner.id, task.id, "todo")
        expect(reopened.completed_at is None, "reopen clears completed_at")
        raises_http(400, task_service.set_task_status, db, owner.id,
                    task.id, "archived")

    def assignment_lifecycle():
        task = task_service.create_task(db, owner.id, TaskCreate(title="Deleg"))
        task_service.assign_user(db, owner.id, task.id, helper.id)
        again = task_service.assign_user(db, owner.id, task.id, helper.id)
        rows = [a for a in again.assignments if a.assignment_status == "active"]
        expect(len(rows) == 1 and rows[0].assigned_user_id == helper.id,
               "idempotent assign")
        raises_http(400, task_service.assign_user, db, owner.id, task.id, 987654)
        raises_http(403, task_service.assign_user, db, helper.id, task.id,
                    stranger.id)

        reassigned = task_service.reassign_task(db, owner.id, task.id, stranger.id)
        active = {a.assigned_user_id for a in reassigned.assignments
                  if a.assignment_status == "active"}
        expect(active == {stranger.id}, "reassign replaces assignees")
        cancelled = [a for a in reassigned.assignments
                     if a.assignment_status == "cancelled"
                     and a.assigned_user_id == helper.id]
        expect(len(cancelled) == 1, "cancelled row kept as history")

        task_service.remove_assignment(db, owner.id, task.id, stranger.id)
        # Removing a never-assigned user is an idempotent no-op (documented).
        task_service.remove_assignment(db, owner.id, task.id, 987654)
        db.expire_all()
        remaining = [a for a in db.scalars(
            select(TaskAssignment).where(TaskAssignment.task_id == task.id))]
        expect(all(a.assignment_status == "cancelled" for a in remaining),
               "no active rows left")

    def hierarchy_and_cycles():
        parent = task_service.create_task(db, owner.id, TaskCreate(title="Epic"))
        child = task_service.create_subtask(
            db, owner.id, parent.id,
            SubtaskCreate(title="Story", parent_task_id=parent.id),
        )
        expect(child.parent_task_id == parent.id, "subtask linked")
        grandchild = task_service.create_subtask(
            db, owner.id, child.id,
            SubtaskCreate(title="Task", parent_task_id=child.id),
        )
        raises_http(400, task_service.set_parent_task, db, owner.id,
                    parent.id, parent.id)  # self
        detached = task_service.set_parent_task(
            db, owner.id, child.id, TaskParentUpdate(parent_task_id=None).parent_task_id
        )
        expect(detached.parent_task_id is None, "detach parent")
        raises_http(404, task_service.create_subtask, db, stranger.id,
                    parent.id, SubtaskCreate(title="y", parent_task_id=parent.id))
        # NOTE: the body/URL parent_task_id mismatch is rejected by the
        # router (test_api covers it); the service takes the URL as truth.

    def comments_and_labels():
        task = task_service.create_task(db, owner.id, TaskCreate(title="Talk"))
        task_service.assign_user(db, owner.id, task.id, helper.id)
        mine = task_service.add_comment(
            db, helper.id, task.id, TaskCommentCreate(content="hello").content
        )
        expect(mine.user_id == helper.id, "comment author recorded")
        items, total = task_service.list_comments(db, helper.id, task.id,
                                                  limit=50, offset=0)
        expect(total == 1 and items[0].id == mine.id, "comment listed")
        raises_http(403, task_service.delete_comment, db, owner.id, task.id,
                    mine.id)  # not the author
        raises_validation(TaskCommentCreate, content="")
        task_service.delete_comment(db, helper.id, task.id, mine.id)
        raises_http(404, task_service.delete_comment, db, helper.id, task.id,
                    mine.id)

        label = task_service.create_label(db, owner.id,
                                          TaskLabelCreate(name="pg-ops",
                                                          color="#33AAff"))
        raises_http(400, task_service.create_label, db, owner.id,
                    TaskLabelCreate(name="pg-ops"))  # unique per creator
        task_service.create_label(db, helper.id, TaskLabelCreate(name="pg-ops"))
        attached = task_service.attach_label(db, owner.id, task.id, label.id)
        attached = task_service.get_task(db, owner.id, task.id)
        expect([l.name for l in task_service.serialize_task(attached)["labels"]]
               == ["pg-ops"], "label attached")
        attached = task_service.attach_label(db, owner.id, task.id, label.id)
        count = len(task_service.serialize_task(
            task_service.get_task(db, owner.id, task.id))["labels"])
        expect(count == 1, "attach idempotent")
        raises_http(403, task_service.attach_label, db, helper.id, task.id,
                    label.id)  # assignee: visible but not owner
        items, total = task_service.list_labels(db, owner.id, limit=100, offset=0)
        expect(total == 1, "label list scoped")
        task_service.detach_label(db, owner.id, task.id, label.id)
        raises_http(404, task_service.attach_label, db, owner.id, task.id, 987654)

    def delete_cascade_and_history():
        parent = task_service.create_task(db, owner.id, TaskCreate(title="Doomed"))
        child = task_service.create_subtask(
            db, owner.id, parent.id,
            SubtaskCreate(title="Survivor", parent_task_id=parent.id),
        )
        task_service.assign_user(db, owner.id, parent.id, helper.id)
        task_service.add_comment(db, helper.id, parent.id, "note")
        label = task_service.create_label(db, owner.id, TaskLabelCreate(name="x1"))
        task_service.attach_label(db, owner.id, parent.id, label.id)

        before = db.scalar(select(func.count()).select_from(TaskActivity))
        task_service.delete_task(db, owner.id, parent.id)
        after_rows = db.scalars(select(TaskActivity)).all()
        expect(len(after_rows) == before + 1, "history kept + final entry")
        doomed = [e for e in after_rows if e.new_value and "Doomed" in e.new_value]
        expect(all(e.task_id is None for e in doomed), "SET NULL applied")
        expect(any(e.action == "task_deleted" for e in doomed),
               "task_deleted snapshot recorded")

        db.expire_all()
        expect(db.get(Task, parent.id) is None, "task hard-deleted")
        survivor = db.get(Task, child.id)
        expect(survivor is not None and survivor.parent_task_id is None,
               "subtask promoted to top level")
        expect(db.scalar(select(func.count()).select_from(TaskComment)
                         .where(TaskComment.task_id == parent.id)) == 0,
               "comments cascaded")
        expect(db.scalar(select(func.count()).select_from(TaskAssignment)
                         .where(TaskAssignment.task_id == parent.id)) == 0,
               "assignments cascaded")
        raises_http(404, task_service.get_task, db, owner.id, parent.id)

    def filters_pagination_sort():
        for i in range(5):
            task_service.create_task(
                db, owner.id, TaskCreate(title=f"Report {i}",
                                         priority="low" if i % 2 else "high")
            )
        task_service.create_task(db, owner.id, TaskCreate(title="Unrelated"))

        items, total = task_service.list_tasks(
            db, owner.id, TaskFilter(q="report"))
        expect(total == 5 and len(items) == 5, "search q")
        items, total = task_service.list_tasks(
            db, owner.id, TaskFilter(priority=["high"]))
        expect(all(t.priority == "high" for t in items), "priority filter")
        items, total = task_service.list_tasks(
            db, owner.id, TaskFilter(status=["done"]))
        expect(total == 0, "status filter")
        items, total = task_service.list_tasks(
            db, owner.id, TaskFilter(limit=2, offset=0))
        expect(total >= 6 and len(items) == 2, "pagination slice")
        items, total = task_service.list_tasks(
            db, owner.id, TaskFilter(limit=2, offset=2))
        expect(len(items) == 2, "second page")
        items, _ = task_service.list_tasks(
            db, owner.id, TaskFilter(sort="priority", order="desc"))
        expect(items[0].priority == "low", "priority sort desc = low first")
        raises_validation(TaskFilter, status=["archived"])

    def statistics():
        t = task_service.create_task(db, stranger.id, TaskCreate(title="stat"))
        task_service.set_task_status(db, stranger.id, t.id, "done")
        task_service.create_task(db, stranger.id, TaskCreate(title="stat2",
                                                             priority="urgent"))
        stats = task_service.task_statistics(db, stranger.id)
        expect(stats["total"] == 2 and stats["completed"] == 1
               and stats["open"] == 1 and stats["completion_rate"] == 0.5,
               f"stats math: {stats}")
        expect(stats["by_status"].get("done") == 1
               and stats["by_priority"].get("urgent") == 1, "stats groups")

    def idor_and_isolation():
        task = task_service.create_task(db, owner.id, TaskCreate(title="Secret"))
        for fn, args in (
            (task_service.get_task, (stranger.id, task.id)),
            (task_service.update_task, (stranger.id, task.id,
                                        TaskUpdate(title="hijack"))),
            (task_service.set_task_status, (stranger.id, task.id, "done")),
            (task_service.delete_task, (stranger.id, task.id)),
            (task_service.list_comments, (stranger.id, task.id)),
            (task_service.list_activity, (stranger.id, task.id)),
            (task_service.add_comment, (stranger.id, task.id, "intrude")),
            (task_service.assign_user, (stranger.id, task.id, stranger.id)),
        ):
            raises_http(404, fn, db, *args)
        raises_http(404, task_service.get_task, db, stranger.id, 999999)
        items, total = task_service.list_tasks(db, stranger.id, TaskFilter())
        ids = {t.id for t in items}
        expect(task.id not in ids, "cross-user leakage in list")
        expect(total == 2, f"stranger sees only own tasks ({total})")

    for name, fn in (
        ("crud_validation_and_activity", crud_and_activity),
        ("status_transition_rules", status_rules),
        ("assignment_lifecycle", assignment_lifecycle),
        ("hierarchy_and_cycle_rejection", hierarchy_and_cycles),
        ("comments_and_labels", comments_and_labels),
        ("delete_cascade_and_history", delete_cascade_and_history),
        ("filters_pagination_sort", filters_pagination_sort),
        ("statistics", statistics),
        ("idor_and_cross_user_isolation", idor_and_isolation),
    ):
        check(name, fn)
    db.close()


# ---------------------------------------------------------------------------
# Section 3 — response-model validation (what FastAPI would serialize)
# ---------------------------------------------------------------------------

def run_response_model_checks() -> None:
    section("3. RESPONSE-MODEL VALIDATION (Pydantic round-trip)")
    db = SessionLocal()
    owner = make_user(db, "pg_serializer")
    helper = make_user(db, "pg_helper2")

    def task_response():
        task = task_service.create_task(
            db, owner.id, TaskCreate(title="Serialize me", priority="high")
        )
        task_service.assign_user(db, owner.id, task.id, helper.id)
        label = task_service.create_label(db, owner.id, TaskLabelCreate(name="s1"))
        task_service.attach_label(db, owner.id, task.id, label.id)
        task = task_service.get_task(db, owner.id, task.id)
        model = TaskResponse.model_validate(task_service.serialize_task(task))
        expect(model.title == "Serialize me" and model.priority == "high",
               "TaskResponse fields")
        expect(len(model.assignments) == 1 and len(model.labels) == 1,
               "embedded collections")

    def list_envelope():
        task = task_service.create_task(db, owner.id, TaskCreate(title="li"))
        items, total = task_service.list_tasks(
            db, owner.id, TaskFilter(limit=10, offset=0))
        env = TaskListResponse.model_validate(
            {"items": [task_service.serialize_task(t) for t in items],
             "total": total, "limit": 10, "offset": 0})
        expect(env.total >= 1 and task.id in {i.id for i in env.items},
               "list envelope")

    def comments_and_activity_models():
        task = task_service.create_task(db, owner.id, TaskCreate(title="cm"))
        comment = task_service.add_comment(db, owner.id, task.id, "hey")
        TaskCommentOut.model_validate(
            {"id": comment.id, "task_id": comment.task_id,
             "user_id": comment.user_id, "content": comment.content,
             "created_at": comment.created_at,
             "updated_at": comment.updated_at})
        items, total = task_service.list_comments(db, owner.id, task.id,
                                                  limit=50, offset=0)
        TaskCommentListResponse.model_validate(
            {"items": [{"id": c.id, "task_id": c.task_id, "user_id": c.user_id,
                        "content": c.content, "created_at": c.created_at,
                        "updated_at": c.updated_at}
                       for c in items],
             "total": total, "limit": 50, "offset": 0})
        activities, total = task_service.list_activity(
            db, owner.id, task.id, limit=50, offset=0)
        TaskActivityListResponse.model_validate(
            {"items": [{"id": a.id, "task_id": a.task_id, "actor_id": a.actor_id,
                        "action": a.action, "old_value": a.old_value,
                        "new_value": a.new_value, "created_at": a.created_at}
                       for a in activities],
             "total": total, "limit": 50, "offset": 0})
        # newest first: the last action was the comment, then task creation.
        expect(activities[0].action == "comment_added"
               and activities[-1].action == "task_created", "newest first")

    def statistics_model():
        TaskStatisticsOut.model_validate(task_service.task_statistics(db, owner.id))

    def labels_model():
        label = task_service.create_label(db, owner.id, TaskLabelCreate(name="s2"))
        TaskLabelOut.model_validate(
            {"id": label.id, "name": label.name, "color": label.color,
             "created_by": label.created_by})
        items, total = task_service.list_labels(db, owner.id, limit=100, offset=0)
        TaskLabelListResponse.model_validate(
            {"items": [{"id": l.id, "name": l.name, "color": l.color,
                        "created_by": l.created_by} for l in items],
             "total": total, "limit": 100, "offset": 0})

    for name, fn in (
        ("task_response_model", task_response),
        ("list_envelope_model", list_envelope),
        ("comment_and_activity_models", comments_and_activity_models),
        ("statistics_model", statistics_model),
        ("label_models", labels_model),
    ):
        check(name, fn)
    db.close()


# ---------------------------------------------------------------------------
# Section 4 — concurrency: duplicate assignment race -> 409
# ---------------------------------------------------------------------------

def run_concurrency_checks() -> None:
    section("4. CONCURRENCY (duplicate assignment race)")
    db = SessionLocal()
    owner = make_user(db, "pg_racer")
    racer = make_user(db, "pg_racer2")
    task = task_service.create_task(db, owner.id, TaskCreate(title="Race"))

    def duplicate_commit_race():
        # Deterministic interleaving: B completes its "is there already an
        # active assignment?" SELECT while A's conflicting row is still
        # uncommitted; only then does A commit, so B's INSERT must lose the
        # race at commit time and surface as HTTP 409 (never a raw 500).
        session_a = SessionLocal()
        from service.task import repository
        repository.create_assignment(
            session_a, task_id=task.id,
            assigned_user_id=racer.id, assigned_by=owner.id,
        )
        # Emit the INSERT without committing: the row lock on the unique
        # index is held until session_a commits.
        session_a.flush()

        original_get_assignment = repository.get_assignment
        started = threading.Event()
        release = threading.Event()

        def guarded_get_assignment(*args, **kwargs):
            result = original_get_assignment(*args, **kwargs)
            started.set()   # B has seen "no active assignment"
            release.wait()  # ...now pause before B inserts
            return result

        outcome: dict = {}

        def racer_thread():
            session_b = SessionLocal()
            try:
                repository.get_assignment = guarded_get_assignment
                task_service.assign_user(session_b, owner.id, task.id, racer.id)
                outcome["result"] = "ok"
            except fastapi.HTTPException as exc:
                outcome["result"] = exc.status_code
            except Exception as exc:  # raw escape = bug
                outcome["result"] = repr(exc)
            finally:
                repository.get_assignment = original_get_assignment
                session_b.close()

        thread = threading.Thread(target=racer_thread)
        thread.start()
        started.wait(timeout=10)
        session_a.commit()  # A wins; B's commit must now fail
        release.set()       # let B proceed into the conflict
        thread.join(timeout=30)
        session_a.close()
        expect(outcome.get("result") == 409,
               f"race must yield 409, got {outcome.get('result')!r}")

    def unique_constraint_holds():
        # Direct DB-level proof: for a pair with no row yet, a second
        # cancelled row for the same (task, user) still violates the unique
        # index — uniqueness is pair-level, not status-level.
        session_x = SessionLocal()
        session_y = SessionLocal()
        try:
            session_x.add(TaskAssignment(
                task_id=task.id, assigned_user_id=owner.id, assigned_by=owner.id,
                assignment_status="cancelled",
            ))
            session_x.commit()
            session_y.add(TaskAssignment(
                task_id=task.id, assigned_user_id=owner.id, assigned_by=owner.id,
                assignment_status="cancelled",
            ))
            session_y.commit()
            raise AssertionError("unique index did not reject the duplicate")
        except IntegrityError:
            session_y.rollback()
        finally:
            session_x.close()
            session_y.close()

    for name, fn in (
        ("duplicate_assignment_race_maps_to_409", duplicate_commit_race),
        ("unique_index_rejects_duplicate_pairs", unique_constraint_holds),
    ):
        check(name, fn)
    db.close()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def _reset_previous_run() -> None:
    """Remove data left by a previous validation run so the script is
    idempotent. Only task-domain rows and this script's own users are
    touched (the database is an isolated test database by the safety gate)."""
    from sqlalchemy import text
    db = SessionLocal()
    for table in ("task_label_assignments", "task_activities", "task_comments",
                  "task_assignments", "task_labels", "tasks"):
        db.execute(text(f"DELETE FROM {table}"))
    db.execute(text("DELETE FROM users WHERE username LIKE 'pg\\_%'"))
    db.commit()
    db.close()


def main() -> int:
    # ---- safety gate -------------------------------------------------------
    url = os.getenv("DATABASE_URL")
    if not url:
        print("REFUSED: DATABASE_URL is not set. This validator only runs "
              "against an explicitly provided, isolated database.")
        return 2
    if os.getenv("TASK_VALIDATE_ALLOW_REAL_DB") != "1":
        print("REFUSED: set TASK_VALIDATE_ALLOW_REAL_DB=1 to confirm you are "
              "pointing at an isolated test database.")
        return 2
    dbname = url.rsplit("/", 1)[-1].split("?")[0]
    if not any(marker in dbname.lower() for marker in ("test", "validate")):
        print(f"REFUSED: database {dbname!r} does not look like a test "
              "database (name must contain 'test' or 'validate').")
        return 2

    print("Validating task module against:", url)
    _reset_previous_run()
    run_schema_checks()
    run_functional_checks()
    run_response_model_checks()
    run_concurrency_checks()

    passed = sum(1 for _, ok, _ in RESULTS if ok)
    failed = len(RESULTS) - passed
    print(f"\n{'=' * 72}")
    print(f"POSTGRES VALIDATION RESULT: passed={passed} failed={failed}")
    print("=" * 72)
    if failed:
        print("\nFailure details:")
        for name, ok, tb in RESULTS:
            if not ok:
                print(f"\n### {name}\n{tb}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
