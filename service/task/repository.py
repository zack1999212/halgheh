"""Repository layer for the task module.

Pure SQLAlchemy query construction. Every function takes a ``Session`` as
its first argument, returns ORM instances / tuples, raises no HTTP errors
and performs **no commits** — transaction boundaries belong to the service
layer (same contract as ``service/calendar/repository.py``).

List operations return ``(items, total)`` tuples: the count is computed from
a subquery of the *filtered* statement before ``limit``/``offset`` are
applied, so pagination totals are exact with a single extra cheap query.
List queries never touch relationships (summaries are scalar-only), which
removes N+1 risk by construction; single-task fetches eager-load
assignments and labels via ``selectinload``.
"""

from __future__ import annotations

from datetime import date
from typing import Iterator

from sqlalchemy import Select, and_, case, exists, func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..auth.models import User
from ..project.models import Project, ProjectMember
from ..workspace.models import TaskWorkspace, WorkspaceMember
from ..docs.models import Workspace
from .models import (
    Task,
    TaskActivity,
    TaskAssignment,
    TaskComment,
    TaskLabel,
    TaskLabelAssignment,
)
from .schemas import TaskFilter

# Sort keys exposed through the API. ``priority`` sorts by severity weight
# (urgent first), never alphabetically.
_SORT_COLUMNS = {
    "due_date": Task.due_date,
    "created_at": Task.created_at,
    "updated_at": Task.updated_at,
}

# Default ordering: open work first, then nearest deadline (missing deadline
# last), then higher priority, then a deterministic id tie-break (mirrors the
# calendar's coalesce + id convention).
_INCOMPLETE_FIRST = case(
    (Task.status.in_(("done", "cancelled")), 1),
    else_=0,
)
_PRIORITY_WEIGHT = case(
    (Task.priority == "urgent", 0),
    (Task.priority == "high", 1),
    (Task.priority == "medium", 2),
    else_=3,
)
_DEFAULT_ORDER = (
    _INCOMPLETE_FIRST.asc(),
    Task.due_date.asc().nulls_last(),
    _PRIORITY_WEIGHT.asc(),
    Task.id.asc(),
)

def _active_assignment_for(user_id: int):
    return and_(
        TaskAssignment.assigned_user_id == user_id,
        TaskAssignment.assignment_status == "active",
    )


def _accessible_projects_subquery(user_id: int):
    owned = select(Project.id).where(Project.owner_id == user_id)
    joined = select(ProjectMember.project_id).where(ProjectMember.user_id == user_id)
    return owned.union(joined)


def _accessible_workspace_subquery(user_id: int):
    owned = select(Workspace.id).where(Workspace.owner_id == user_id)
    member = (
        select(WorkspaceMember.workspace_id)
        .join(Workspace, Workspace.id == WorkspaceMember.workspace_id)
        .where(WorkspaceMember.user_id == user_id, Workspace.workspace_type == "shared")
    )
    return owned.union(member)


def _visible_clause(user_id: int):
    """Visibility predicate.

    Canonical: task is associated with any workspace accessible to the user.
    Legacy fallback: personal/project visibility rules for rows missing associations.
    """
    assignee_active = _active_assignment_for(user_id)
    personal_parent_visible = Task.parent_task_id.in_(
        select(Task.id).where(
            and_(
                Task.project_id.is_(None),
                or_(
                    Task.created_by == user_id,
                    Task.assignments.any(assignee_active),
                ),
            )
        )
    )
    personal_visible = and_(
        Task.project_id.is_(None),
        or_(
            Task.created_by == user_id,
            Task.assignments.any(assignee_active),
            personal_parent_visible,
        ),
    )
    project_visible = and_(
        Task.project_id.is_not(None),
        Task.project_id.in_(_accessible_projects_subquery(user_id)),
    )
    workspace_visible = Task.id.in_(
        select(TaskWorkspace.task_id).where(
            TaskWorkspace.workspace_id.in_(_accessible_workspace_subquery(user_id))
        )
    )
    has_workspace_assoc = exists().where(TaskWorkspace.task_id == Task.id)
    legacy_visible = or_(personal_visible, project_visible)
    return or_(workspace_visible, and_(~has_workspace_assoc, legacy_visible))


def _order_clause(sort: str | None, order: str) -> tuple:
    if not sort:
        return _DEFAULT_ORDER
    if sort == "priority":
        column = _PRIORITY_WEIGHT
    else:
        column = _SORT_COLUMNS[sort]
    key = column.desc() if order == "desc" else column.asc()
    if sort == "due_date" and order == "asc":
        key = key.nulls_last()
    return (key, Task.id.asc())


def _apply_filters(stmt: Select, flt: TaskFilter) -> Select:
    if flt.status:
        stmt = stmt.where(Task.status.in_(flt.status))
    if flt.priority:
        stmt = stmt.where(Task.priority.in_(flt.priority))
    if flt.created_by is not None:
        stmt = stmt.where(Task.created_by == flt.created_by)
    if flt.assigned_user_id is not None:
        stmt = stmt.where(
            Task.assignments.any(_active_assignment_for(flt.assigned_user_id))
        )
    if flt.parent_task_id is not None:
        stmt = stmt.where(Task.parent_task_id == flt.parent_task_id)
    if getattr(flt, "workspace_id", None) is not None:
        stmt = stmt.where(
            Task.id.in_(
                select(TaskWorkspace.task_id).where(
                    TaskWorkspace.workspace_id == flt.workspace_id
                )
            )
        )
    if getattr(flt, "project_id", None) is not None:
        stmt = stmt.where(Task.project_id == flt.project_id)
    elif flt.parent_task_id is None and getattr(flt, "workspace_id", None) is None:
        # Personal views/lists must not include project-associated tasks.
        # Subtask listings are scoped by an already-authorized parent task.
        stmt = stmt.where(Task.project_id.is_(None))
    if flt.label_id is not None:
        stmt = stmt.where(
            Task.label_assignments.any(TaskLabelAssignment.label_id == flt.label_id)
        )
    if flt.due:
        today = date.today()
        if flt.due == "overdue":
            stmt = stmt.where(
                and_(
                    Task.due_date < today,
                    Task.status.notin_(("done", "cancelled")),
                )
            )
        elif flt.due == "today":
            stmt = stmt.where(Task.due_date == today)
        elif flt.due == "upcoming":
            stmt = stmt.where(Task.due_date >= today)
        else:  # "no_due"
            stmt = stmt.where(Task.due_date.is_(None))
    if flt.q:
        pattern = f"%{flt.q}%"
        stmt = stmt.where(
            or_(Task.title.ilike(pattern), Task.description.ilike(pattern))
        )
    return stmt


def _list_with_filters(
    db: Session, condition, flt: TaskFilter
) -> tuple[list[Task], int]:
    stmt = _apply_filters(select(Task).where(condition), flt)
    stmt = stmt.order_by(*_order_clause(flt.sort, flt.order))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    items = list(db.scalars(stmt.limit(flt.limit).offset(flt.offset)))
    return items, int(total or 0)


# ---------------------------------------------------------------------------
# Tasks
# ---------------------------------------------------------------------------


def create_task(db: Session, **fields) -> Task:
    task = Task(**fields)
    db.add(task)
    # Flush (not commit) so the caller can use the generated id — e.g. for
    # audit entries — before the service layer commits the transaction.
    db.flush()
    return task


def get_task(db: Session, task_id: int, *, eager: bool = True) -> Task | None:
    stmt = select(Task).where(Task.id == task_id)
    if eager:
        stmt = stmt.options(
            selectinload(Task.assignments),
            selectinload(Task.label_assignments).selectinload(
                TaskLabelAssignment.label
            ),
        )
    return db.scalars(stmt).first()


def list_visible(db: Session, user_id: int, flt: TaskFilter):
    return _list_with_filters(db, _visible_clause(user_id), flt)


def list_created_by(db: Session, user_id: int, flt: TaskFilter):
    return _list_with_filters(
        db, and_(Task.created_by == user_id, _visible_clause(user_id)), flt
    )


def list_assigned_to(db: Session, user_id: int, flt: TaskFilter):
    return _list_with_filters(
        db,
        and_(
            Task.assignments.any(_active_assignment_for(user_id)),
            _visible_clause(user_id),
        ),
        flt,
    )


def list_assigned_by(db: Session, user_id: int, flt: TaskFilter):
    """Tasks where ``user_id`` performed an active assignment (the "work I
    delegated" list; the future manager view)."""
    return _list_with_filters(
        db,
        and_(
            Task.assignments.any(
                and_(
                    TaskAssignment.assigned_by == user_id,
                    TaskAssignment.assignment_status == "active",
                )
            ),
            _visible_clause(user_id),
        ),
        flt,
    )


def list_subtasks(db: Session, user_id: int, parent_task_id: int, flt: TaskFilter):
    return _list_with_filters(
        db,
        and_(Task.parent_task_id == parent_task_id, _visible_clause(user_id)),
        flt,
    )


def task_statistics(db: Session, user_id: int, project_id: int | None = None) -> dict:
    """Grouped counters over the user's visible tasks (SQL-side aggregation,
    no per-task Python loop)."""
    cond = _visible_clause(user_id)
    if project_id is not None:
        cond = and_(cond, Task.project_id == project_id)
    else:
        # Personal statistics must not include project-associated tasks.
        cond = and_(cond, Task.project_id.is_(None))
    by_status = dict(
        db.execute(
            select(Task.status, func.count()).where(cond).group_by(Task.status)
        ).all()
    )
    by_priority = dict(
        db.execute(
            select(Task.priority, func.count()).where(cond).group_by(Task.priority)
        ).all()
    )
    today = date.today()
    overdue = db.scalar(
        select(func.count())
        .select_from(Task)
        .where(
            cond,
            Task.due_date < today,
            Task.status.notin_(("done", "cancelled")),
        )
    )
    due_today = db.scalar(
        select(func.count()).select_from(Task).where(cond, Task.due_date == today)
    )
    return {
        "by_status": {str(k): int(v) for k, v in by_status.items()},
        "by_priority": {str(k): int(v) for k, v in by_priority.items()},
        "overdue": int(overdue or 0),
        "due_today": int(due_today or 0),
    }


def update_task(db: Session, task: Task, **fields) -> Task:
    for field, value in fields.items():
        setattr(task, field, value)
    return task


def delete_task(db: Session, task: Task) -> None:
    """Hard delete (the platform convention; no soft-delete column exists).
    Comments/assignments/label links cascade via FK; activity rows survive
    (SET NULL); children are promoted (SET NULL)."""
    db.delete(task)


def ancestor_ids(db: Session, task_id: int, *, max_depth: int = 100) -> Iterator[int]:
    """Yield ancestor ids walking up the parent chain.

    Used by the service layer to reject circular parent-child relationships.
    Bounded by ``max_depth``; the database also forbids self-parents.
    """
    seen: set[int] = set()
    current: int | None = task_id
    for _ in range(max_depth):
        current = db.scalar(select(Task.parent_task_id).where(Task.id == current))
        if current is None or current in seen:
            return
        seen.add(current)
        yield current


# ---------------------------------------------------------------------------
# Assignments
# ---------------------------------------------------------------------------


def user_exists(db: Session, user_id: int) -> bool:
    return db.get(User, user_id) is not None


def get_assignment(
    db: Session, task_id: int, assigned_user_id: int
) -> TaskAssignment | None:
    stmt = select(TaskAssignment).where(
        TaskAssignment.task_id == task_id,
        TaskAssignment.assigned_user_id == assigned_user_id,
    )
    return db.scalars(stmt).first()


def create_assignment(
    db: Session,
    *,
    task_id: int,
    assigned_user_id: int,
    assigned_by: int,
    assignment_status: str = "active",
) -> TaskAssignment:
    assignment = TaskAssignment(
        task_id=task_id,
        assigned_user_id=assigned_user_id,
        assigned_by=assigned_by,
        assignment_status=assignment_status,
    )
    db.add(assignment)
    # NOTE: no flush here. A concurrent duplicate assignment would raise
    # IntegrityError at flush time — outside the service's _commit guard —
    # and escape as a raw 500. Deferring to commit lets _commit map the
    # uniqueness race to its 409 response.
    return assignment


def list_assignments(
    db: Session, task_id: int, *, status: str | None = None
) -> list[TaskAssignment]:
    stmt = select(TaskAssignment).where(TaskAssignment.task_id == task_id)
    if status:
        stmt = stmt.where(TaskAssignment.assignment_status == status)
    stmt = stmt.order_by(TaskAssignment.assigned_at.asc(), TaskAssignment.id.asc())
    return list(db.scalars(stmt))


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------


def create_comment(db: Session, *, task_id: int, user_id: int, content: str):
    comment = TaskComment(task_id=task_id, user_id=user_id, content=content)
    db.add(comment)
    db.flush()  # PK available for audit entries; service still owns the commit
    return comment


def get_comment(db: Session, task_id: int, comment_id: int) -> TaskComment | None:
    stmt = select(TaskComment).where(
        TaskComment.task_id == task_id, TaskComment.id == comment_id
    )
    return db.scalars(stmt).first()


def list_comments(
    db: Session, task_id: int, *, limit: int = 100, offset: int = 0
) -> tuple[list[TaskComment], int]:
    stmt = (
        select(TaskComment)
        .where(TaskComment.task_id == task_id)
        .order_by(TaskComment.created_at.asc(), TaskComment.id.asc())
    )
    total = db.scalar(
        select(func.count())
        .select_from(TaskComment)
        .where(TaskComment.task_id == task_id)
    )
    items = list(db.scalars(stmt.limit(limit).offset(offset)))
    return items, int(total or 0)


def delete_comment(db: Session, comment: TaskComment) -> None:
    db.delete(comment)


# ---------------------------------------------------------------------------
# Activity history
# ---------------------------------------------------------------------------


def add_activity(
    db: Session,
    *,
    task_id: int | None,
    actor_id: int,
    action: str,
    old_value: str | None = None,
    new_value: str | None = None,
) -> TaskActivity:
    entry = TaskActivity(
        task_id=task_id,
        actor_id=actor_id,
        action=action,
        old_value=old_value,
        new_value=new_value,
    )
    db.add(entry)
    return entry


def list_activity(
    db: Session, task_id: int, *, limit: int = 100, offset: int = 0
) -> tuple[list[TaskActivity], int]:
    base = TaskActivity.task_id == task_id
    stmt = (
        select(TaskActivity)
        .where(base)
        .order_by(TaskActivity.created_at.desc(), TaskActivity.id.desc())
    )
    total = db.scalar(select(func.count()).select_from(TaskActivity).where(base))
    items = list(db.scalars(stmt.limit(limit).offset(offset)))
    return items, int(total or 0)


# ---------------------------------------------------------------------------
# Labels
# ---------------------------------------------------------------------------


def create_label(
    db: Session, *, created_by: int, name: str, color: str | None
) -> TaskLabel:
    label = TaskLabel(created_by=created_by, name=name, color=color)
    db.add(label)
    return label


def get_label(db: Session, label_id: int) -> TaskLabel | None:
    return db.get(TaskLabel, label_id)


def get_label_for_user(
    db: Session, label_id: int, created_by: int
) -> TaskLabel | None:
    stmt = select(TaskLabel).where(
        TaskLabel.id == label_id, TaskLabel.created_by == created_by
    )
    return db.scalars(stmt).first()


def list_labels(
    db: Session, created_by: int, *, limit: int = 100, offset: int = 0
) -> tuple[list[TaskLabel], int]:
    base = TaskLabel.created_by == created_by
    stmt = (
        select(TaskLabel)
        .where(base)
        .order_by(TaskLabel.name.asc(), TaskLabel.id.asc())
    )
    total = db.scalar(select(func.count()).select_from(TaskLabel).where(base))
    items = list(db.scalars(stmt.limit(limit).offset(offset)))
    return items, int(total or 0)


def list_label_links(db: Session, label_id: int) -> list[TaskLabelAssignment]:
    stmt = select(TaskLabelAssignment).where(TaskLabelAssignment.label_id == label_id)
    return list(db.scalars(stmt))


def get_label_link(
    db: Session, task_id: int, label_id: int
) -> TaskLabelAssignment | None:
    stmt = select(TaskLabelAssignment).where(
        TaskLabelAssignment.task_id == task_id,
        TaskLabelAssignment.label_id == label_id,
    )
    return db.scalars(stmt).first()


def attach_label(db: Session, *, task_id: int, label_id: int) -> TaskLabelAssignment:
    link = TaskLabelAssignment(task_id=task_id, label_id=label_id)
    db.add(link)
    return link


def detach_label(db: Session, link: TaskLabelAssignment) -> None:
    db.delete(link)
