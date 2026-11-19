"""Service layer for the task module.

Business rules, authorization, activity recording and transaction
boundaries live here; the router (later phase) stays thin and the
repository stays commit-free. Conventions follow
``service/calendar/service.py``: take ``db`` first, commit at the end of
each operation, convert ``IntegrityError`` to HTTP errors, and use string
``HTTPException.detail`` messages.

Authorization summary (see ``permissions.py``):

* Invisible/nonexistent task               -> 404 "Task not found"
* Visible task, insufficient permission    -> 403
* Only the owner may restructure (title, dates, parent, labels, deletion,
  assignment control). An active assignee may change status and comment.
* The actor is always supplied by the caller (the router will pass
  ``current_user.id`` from the existing ``get_current_user`` dependency);
  no request schema ever carries the actor id.

Every mutation writes ``TaskActivity`` rows in the SAME transaction as the
change, so history and data move atomically.
"""

from __future__ import annotations

import json
from datetime import date, datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import permissions, repository
from .models import DONE_STATUS, TASK_STATUSES, Task
from ..project import permissions as project_permissions
from ..project import service as project_service
from .schemas import (
    SubtaskCreate,
    TaskCreate,
    TaskFilter,
    TaskLabelCreate,
    TaskLabelUpdate,
    TaskUpdate,
)

# Valid status transitions. Transitions to the same status are handled as
# idempotent no-ops before this map is consulted. Reopening is possible from
# done -> (todo | in_progress) and cancelled -> todo.
ALLOWED_STATUS_TRANSITIONS: dict[str, set[str]] = {
    "todo": {"in_progress", "blocked", "done", "cancelled"},
    "in_progress": {"todo", "blocked", "done", "cancelled"},
    "blocked": {"in_progress", "done", "cancelled"},
    "done": {"todo", "in_progress"},
    "cancelled": {"todo"},
}

# Which audit action a PATCHed field maps to.
_FIELD_ACTIONS = {
    "priority": "priority_changed",
    "due_date": "due_date_changed",
    "start_date": "due_date_changed",
    "parent_task_id": "task_updated",
}

_MAX_LIST_LIMIT = 100


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _not_found(detail: str = "Task not found") -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


def _forbidden(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


def _bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def _snap(value) -> str | None:
    """Serialize a field value for the audit trail (None stays None)."""
    if value is None:
        return None
    return json.dumps(value, default=str)


def _commit(db: Session, *, conflict_detail: str, conflict_status: int) -> None:
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=conflict_status, detail=conflict_detail)


def _project_role_for_task(db: Session, task: Task, actor_id: int) -> str:
    if task.project_id is None:
        return project_permissions.ROLE_NONE
    return project_service.get_project_role(db, actor_id, task.project_id)


def _access_role(db: Session, task: Task | None, actor_id: int) -> str:
    if task is None:
        return permissions.ROLE_NONE
    if task.project_id is not None:
        prole = _project_role_for_task(db, task, actor_id)
        if not project_permissions.can_view(prole):
            return permissions.ROLE_NONE
        if project_permissions.can_manage_project_content(prole):
            return permissions.ROLE_OWNER
        return permissions.ROLE_PROJECT_VIEWER
    return permissions.task_role(task, actor_id)


def _visible_task(db: Session, actor_id: int, task_id: int) -> tuple[Task, str]:
    """Load a task the actor can see, else 404 (indistinguishable from
    nonexistent — guessed ids reveal nothing)."""
    task = repository.get_task(db, task_id)
    role = _access_role(db, task, actor_id)
    if role == permissions.ROLE_NONE:
        raise _not_found()
    return task, role


def _owned_task(db: Session, actor_id: int, task_id: int) -> Task:
    task, role = _visible_task(db, actor_id, task_id)
    if not permissions.can_edit(role):
        raise _forbidden("Not allowed to modify this task")
    return task


def _validate_dates(start: date | None, due: date | None) -> None:
    if start and due and due < start:
        raise _bad_request("due_date must not be earlier than start_date")


def serialize_task(task: Task) -> dict:
    """Shape a loaded Task for ``TaskResponse`` (labels flattened from the
    link rows; done in the service so the router stays thin)."""
    return {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "status": task.status,
        "priority": task.priority,
        "start_date": task.start_date,
        "due_date": task.due_date,
        "completed_at": task.completed_at,
        "parent_task_id": task.parent_task_id,
        "created_by": task.created_by,
        "project_id": task.project_id,
        "created_at": task.created_at,
        "updated_at": task.updated_at,
        "labels": [link.label for link in task.label_assignments],
        "assignments": list(task.assignments),
    }


# ---------------------------------------------------------------------------
# Tasks: create / read / list / update / delete
# ---------------------------------------------------------------------------


def create_task(db: Session, actor_id: int, data: TaskCreate) -> Task:
    """Create a task owned by the authenticated actor (rule: every task has
    an authenticated creator; ids from the request body are never trusted)."""
    _validate_dates(data.start_date, data.due_date)
    project_id = getattr(data, "project_id", None)
    if project_id is not None:
        project_service.require_project_manage(db, actor_id, project_id)
    task = repository.create_task(
        db,
        title=data.title,
        description=data.description,
        status="todo",
        priority=data.priority,
        created_by=actor_id,
        parent_task_id=None,
        project_id=project_id,
        start_date=data.start_date,
        due_date=data.due_date,
        completed_at=None,
    )
    repository.add_activity(
        db,
        task_id=task.id,
        actor_id=actor_id,
        action="task_created",
        old_value=None,
        new_value=_snap({"id": task.id, "title": task.title}),
    )
    _commit(
        db,
        conflict_detail="Could not create the task",
        conflict_status=status.HTTP_400_BAD_REQUEST,
    )
    db.refresh(task)
    return task


def create_subtask(
    db: Session, actor_id: int, parent_task_id: int, data: SubtaskCreate
) -> Task:
    """Create a subtask under an accessible parent.

    Only the parent's owner may spawn subtasks: since subtask creation is
    owner-only, every descendant's ``created_by`` equals the root owner,
    which keeps visibility rules simple and prevents cross-owner trees.
    A brand-new task cannot form a cycle (it has no descendants), but the
    parent must be accessible.
    """
    parent, role = _visible_task(db, actor_id, parent_task_id)
    if not permissions.can_edit(role):
        raise _forbidden("Not allowed to modify this task")
    _validate_dates(data.start_date, data.due_date)
    task = repository.create_task(
        db,
        title=data.title,
        description=data.description,
        status="todo",
        priority=data.priority,
        created_by=actor_id,
        parent_task_id=parent.id,
        project_id=parent.project_id,
        start_date=data.start_date,
        due_date=data.due_date,
        completed_at=None,
    )
    repository.add_activity(
        db,
        task_id=task.id,
        actor_id=actor_id,
        action="task_created",
        old_value=None,
        new_value=_snap({"id": task.id, "title": task.title, "parent": parent.id}),
    )
    _commit(
        db,
        conflict_detail="Could not create the subtask",
        conflict_status=status.HTTP_400_BAD_REQUEST,
    )
    db.refresh(task)
    return task


def get_task(db: Session, actor_id: int, task_id: int) -> Task:
    task, _role = _visible_task(db, actor_id, task_id)
    return task


def list_tasks(
    db: Session, actor_id: int, flt: TaskFilter, scope: str = "visible"
) -> tuple[list[Task], int]:
    """Filtered / searched / paginated listing.

    Scopes: ``visible`` (creator or active assignee), ``created`` (tasks the
    actor created), ``assigned`` (tasks actively assigned to the actor) and
    ``assigned_by`` (tasks the actor actively delegated to others — the
    future manager view). Unrelated users' data is unreachable by the
    visibility clause regardless of the filter values supplied.
    """
    scopes = {
        "visible": repository.list_visible,
        "created": repository.list_created_by,
        "assigned": repository.list_assigned_to,
        "assigned_by": repository.list_assigned_by,
    }
    if scope not in scopes:
        raise _bad_request(f"Unknown list scope: {scope}")
    return scopes[scope](db, actor_id, flt)


def update_task(db: Session, actor_id: int, task_id: int, data: TaskUpdate) -> Task:
    """Owner-only partial update with per-field audit entries.

    Status is deliberately NOT part of this operation (dedicated transition
    endpoint manages ``completed_at`` atomically with the status value).
    """
    task = _owned_task(db, actor_id, task_id)
    updates = data.model_dump(exclude_unset=True)

    old_project_id = task.project_id
    project_changed = False
    if "project_id" in updates:
        new_project_id = updates.pop("project_id")
        if task.project_id is not None:
            project_service.require_project_manage(db, actor_id, task.project_id)
        if new_project_id is not None:
            project_service.require_project_manage(db, actor_id, new_project_id)
        if task.project_id is None and task.created_by != actor_id:
            raise _forbidden("Not allowed to modify this task")
        task.project_id = new_project_id
        if old_project_id != new_project_id:
            project_changed = True
            repository.add_activity(
                db,
                task_id=task.id,
                actor_id=actor_id,
                action="project_changed",
                old_value=_snap(old_project_id),
                new_value=_snap(new_project_id),
            )

    if "start_date" in updates or "due_date" in updates:
        merged_start = updates.get("start_date", task.start_date)
        merged_due = updates.get("due_date", task.due_date)
        _validate_dates(merged_start, merged_due)

    changed: list[tuple[str, str, str | None, str | None]] = []
    for field, new_value in updates.items():
        old_value = getattr(task, field)
        if old_value == new_value:
            continue
        changed.append(
            (field, _FIELD_ACTIONS.get(field, "task_updated"), _snap(old_value), _snap(new_value))
        )

    if not changed and not project_changed:
        return task

    repository.update_task(db, task, **updates)

    for _field, action, old_value, new_value in changed:
        repository.add_activity(
            db,
            task_id=task.id,
            actor_id=actor_id,
            action=action,
            old_value=old_value,
            new_value=new_value,
        )
    _commit(
        db,
        conflict_detail="Could not update the task",
        conflict_status=status.HTTP_400_BAD_REQUEST,
    )
    db.refresh(task)
    return task


def delete_task(db: Session, actor_id: int, task_id: int) -> None:
    """Owner-only hard delete (platform convention).

    The audit entry is written in the same transaction *before* the delete;
    the FK ``ON DELETE SET NULL`` then clears ``task_id`` but keeps the row,
    so history survives with an embedded snapshot of the task.
    """
    task = _owned_task(db, actor_id, task_id)
    repository.add_activity(
        db,
        task_id=task.id,
        actor_id=actor_id,
        action="task_deleted",
        old_value=None,
        new_value=_snap({"id": task.id, "title": task.title}),
    )
    repository.delete_task(db, task)
    _commit(
        db,
        conflict_detail="Could not delete the task",
        conflict_status=status.HTTP_400_BAD_REQUEST,
    )


# ---------------------------------------------------------------------------
# Status transitions and parent relationships
# ---------------------------------------------------------------------------


def set_task_status(
    db: Session, actor_id: int, task_id: int, new_status: str
) -> Task:
    """Validate and apply a status transition (owner or active assignee).

    ``completed_at`` is managed here in the same transaction: set when the
    task reaches ``done``, cleared whenever it leaves ``done``. Re-setting
    the current status is an idempotent no-op.
    """
    task, role = _visible_task(db, actor_id, task_id)
    if not permissions.can_change_status(role):
        raise _forbidden("Not allowed to change this task's status")
    if new_status not in TASK_STATUSES:
        raise _bad_request(f"Unknown task status: {new_status}")

    old_status = task.status
    if old_status == new_status:
        return task
    if new_status not in ALLOWED_STATUS_TRANSITIONS[old_status]:
        raise _bad_request(
            f"Invalid status transition from '{old_status}' to '{new_status}'"
        )

    task.status = new_status
    if new_status == DONE_STATUS:
        task.completed_at = datetime.now(timezone.utc)
    else:
        task.completed_at = None

    repository.add_activity(
        db,
        task_id=task.id,
        actor_id=actor_id,
        action="status_changed",
        old_value=old_status,
        new_value=new_status,
    )
    _commit(
        db,
        conflict_detail="Could not update the task status",
        conflict_status=status.HTTP_400_BAD_REQUEST,
    )
    db.refresh(task)
    return task


def set_parent_task(
    db: Session, actor_id: int, task_id: int, parent_task_id: int | None
) -> Task:
    """Attach or detach a parent (owner-only).

    Cycle prevention: walk the proposed parent's ancestor chain; if the
    moved task appears anywhere in it, the move would create a loop and is
    rejected with 400. The parent must also be visible to the actor.
    """
    task = _owned_task(db, actor_id, task_id)
    old_parent = task.parent_task_id

    if parent_task_id is None:
        if old_parent is None:
            return task
        repository.update_task(db, task, parent_task_id=None)
    else:
        if parent_task_id == task.id:
            raise _bad_request("A task cannot be its own parent")
        parent, _role = _visible_task(db, actor_id, parent_task_id)
        if task.id in set(repository.ancestor_ids(db, parent.id)):
            raise _bad_request("Circular parent-child relationship")
        repository.update_task(db, task, parent_task_id=parent.id)

    repository.add_activity(
        db,
        task_id=task.id,
        actor_id=actor_id,
        action="task_updated",
        old_value=_snap(old_parent),
        new_value=_snap(task.parent_task_id),
    )
    _commit(
        db,
        conflict_detail="Could not update the task hierarchy",
        conflict_status=status.HTTP_400_BAD_REQUEST,
    )
    db.refresh(task)
    return task


def list_subtasks(
    db: Session, actor_id: int, parent_task_id: int, flt: TaskFilter
) -> tuple[list[Task], int]:
    _visible_task(db, actor_id, parent_task_id)
    return repository.list_subtasks(db, actor_id, parent_task_id, flt)


def get_parent_task(db: Session, actor_id: int, task_id: int) -> Task | None:
    """Return the parent task if it is visible to the actor."""
    task, _role = _visible_task(db, actor_id, task_id)
    if task.parent_task_id is None:
        return None
    parent, role = _visible_task(db, actor_id, task.parent_task_id)
    if not permissions.can_view(role):
        raise _not_found()
    return parent


def task_statistics(db: Session, actor_id: int) -> dict:
    """Aggregated counters for the actor's visible tasks.

    Computed at the SQL level (repository) and completed here with the
    derived metrics the API contract exposes.
    """
    stats = repository.task_statistics(db, actor_id)
    by_status = stats["by_status"]
    total = sum(by_status.values())
    completed = by_status.get(DONE_STATUS, 0)
    cancelled = by_status.get("cancelled", 0)
    return {
        "total": total,
        "open": total - completed - cancelled,
        "completed": completed,
        "cancelled": cancelled,
        "overdue": stats["overdue"],
        "due_today": stats["due_today"],
        "completion_rate": round(completed / total, 4) if total else 0.0,
        "by_status": by_status,
        "by_priority": stats["by_priority"],
    }


# ---------------------------------------------------------------------------
# Assignments
# ---------------------------------------------------------------------------


def _assignment_target_exists(db: Session, target_user_id: int) -> None:
    if not repository.user_exists(db, target_user_id):
        raise _bad_request("Assigned user not found")


def assign_user(
    db: Session, actor_id: int, task_id: int, target_user_id: int
) -> Task:
    """Assign a user to a task (owner only; manager rule integration point).

    Idempotent: an already-active assignment for the same user is a no-op.
    A previously cancelled assignment is reactivated in place (the unique
    index forbids a second row for the same pair, and history is kept).
    """
    task = _owned_task(db, actor_id, task_id)
    _assignment_target_exists(db, target_user_id)

    existing = repository.get_assignment(db, task.id, target_user_id)
    if existing is not None and existing.assignment_status == "active":
        return task
    if existing is not None:
        existing.assignment_status = "active"
        existing.assigned_by = actor_id
        existing.assigned_at = datetime.now(timezone.utc)
    else:
        repository.create_assignment(
            db,
            task_id=task.id,
            assigned_user_id=target_user_id,
            assigned_by=actor_id,
        )

    repository.add_activity(
        db,
        task_id=task.id,
        actor_id=actor_id,
        action="assignee_added",
        old_value=None,
        new_value=_snap({"user_id": target_user_id}),
    )
    _commit(
        db,
        conflict_detail="User is already assigned to this task",
        conflict_status=status.HTTP_409_CONFLICT,
    )
    db.refresh(task)
    return task


def reassign_task(
    db: Session, actor_id: int, task_id: int, target_user_id: int
) -> Task:
    """Replace all active assignees with a single user (owner only).

    Previous active assignments are cancelled (kept as history), then the
    target is assigned with the same idempotent/reactivation logic as
    ``assign_user``. All of it lands in one transaction.
    """
    task = _owned_task(db, actor_id, task_id)
    _assignment_target_exists(db, target_user_id)

    reassigned = False
    for assignment in task.assignments:
        if (
            assignment.assignment_status == "active"
            and assignment.assigned_user_id != target_user_id
        ):
            assignment.assignment_status = "cancelled"
            repository.add_activity(
                db,
                task_id=task.id,
                actor_id=actor_id,
                action="assignee_removed",
                old_value=_snap({"user_id": assignment.assigned_user_id}),
                new_value=None,
            )
            reassigned = True

    existing = repository.get_assignment(db, task.id, target_user_id)
    target_active = existing is not None and existing.assignment_status == "active"
    if not target_active:
        if existing is not None:
            existing.assignment_status = "active"
            existing.assigned_by = actor_id
            existing.assigned_at = datetime.now(timezone.utc)
        else:
            repository.create_assignment(
                db,
                task_id=task.id,
                assigned_user_id=target_user_id,
                assigned_by=actor_id,
            )
        repository.add_activity(
            db,
            task_id=task.id,
            actor_id=actor_id,
            action="assignee_added",
            old_value=None,
            new_value=_snap({"user_id": target_user_id}),
        )
        reassigned = True

    if not reassigned:
        return task
    _commit(
        db,
        conflict_detail="User is already assigned to this task",
        conflict_status=status.HTTP_409_CONFLICT,
    )
    db.refresh(task)
    return task


def remove_assignment(
    db: Session, actor_id: int, task_id: int, target_user_id: int
) -> Task:
    """Cancel an active assignment (owner only). History is preserved by
    flipping ``assignment_status`` to ``cancelled`` — the row is kept, so
    the unique index still holds and re-assignment can reactivate it.
    Removing a non-assigned user is an idempotent no-op."""
    task = _owned_task(db, actor_id, task_id)
    assignment = repository.get_assignment(db, task.id, target_user_id)
    if assignment is None or assignment.assignment_status != "active":
        return task

    assignment.assignment_status = "cancelled"
    repository.add_activity(
        db,
        task_id=task.id,
        actor_id=actor_id,
        action="assignee_removed",
        old_value=_snap({"user_id": target_user_id}),
        new_value=None,
    )
    _commit(
        db,
        conflict_detail="Could not update the assignment",
        conflict_status=status.HTTP_400_BAD_REQUEST,
    )
    db.refresh(task)
    return task


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------


def add_comment(
    db: Session, actor_id: int, task_id: int, content: str
) -> TaskComment:
    task, role = _visible_task(db, actor_id, task_id)
    if not permissions.can_comment(role):
        raise _forbidden("Not allowed to comment on this task")
    comment = repository.create_comment(
        db, task_id=task.id, user_id=actor_id, content=content
    )
    repository.add_activity(
        db,
        task_id=task.id,
        actor_id=actor_id,
        action="comment_added",
        old_value=None,
        new_value=_snap({"comment_id": comment.id}),
    )
    _commit(
        db,
        conflict_detail="Could not add the comment",
        conflict_status=status.HTTP_400_BAD_REQUEST,
    )
    db.refresh(comment)
    return comment


def list_comments(
    db: Session, actor_id: int, task_id: int, *, limit: int = 100, offset: int = 0
) -> tuple[list[TaskComment], int]:
    _visible_task(db, actor_id, task_id)
    limit = min(max(limit, 1), _MAX_LIST_LIMIT)
    offset = max(offset, 0)
    return repository.list_comments(db, task_id, limit=limit, offset=offset)


def delete_comment(db: Session, actor_id: int, task_id: int, comment_id: int) -> None:
    task, _role = _visible_task(db, actor_id, task_id)
    comment = repository.get_comment(db, task.id, comment_id)
    if comment is None:
        raise _not_found("Comment not found")
    if comment.user_id != actor_id:
        raise _forbidden("Only the comment author can delete it")
    repository.delete_comment(db, comment)
    repository.add_activity(
        db,
        task_id=task.id,
        actor_id=actor_id,
        action="comment_deleted",
        old_value=_snap({"comment_id": comment.id}),
        new_value=None,
    )
    _commit(
        db,
        conflict_detail="Could not delete the comment",
        conflict_status=status.HTTP_400_BAD_REQUEST,
    )


# ---------------------------------------------------------------------------
# Activity history
# ---------------------------------------------------------------------------


def list_activity(
    db: Session, actor_id: int, task_id: int, *, limit: int = 100, offset: int = 0
) -> tuple[list, int]:
    _visible_task(db, actor_id, task_id)
    limit = min(max(limit, 1), _MAX_LIST_LIMIT)
    offset = max(offset, 0)
    return repository.list_activity(db, task_id, limit=limit, offset=offset)


# ---------------------------------------------------------------------------
# Labels
# ---------------------------------------------------------------------------


def create_label(db: Session, actor_id: int, data: TaskLabelCreate):
    label = repository.create_label(
        db, created_by=actor_id, name=data.name, color=data.color
    )
    _commit(
        db,
        conflict_detail="A label with this name already exists",
        conflict_status=status.HTTP_400_BAD_REQUEST,
    )
    db.refresh(label)
    return label


def list_labels(
    db: Session, actor_id: int, *, limit: int = 100, offset: int = 0
) -> tuple[list, int]:
    limit = min(max(limit, 1), _MAX_LIST_LIMIT)
    offset = max(offset, 0)
    return repository.list_labels(db, actor_id, limit=limit, offset=offset)


def update_label(db: Session, actor_id: int, label_id: int, data: TaskLabelUpdate):
    label = repository.get_label_for_user(db, label_id, actor_id)
    if label is None:
        raise _not_found("Label not found")
    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(label, field, value)
    _commit(
        db,
        conflict_detail="A label with this name already exists",
        conflict_status=status.HTTP_400_BAD_REQUEST,
    )
    db.refresh(label)
    return label


def delete_label(db: Session, actor_id: int, label_id: int) -> None:
    """Delete a label and its links (links cascade).

    Per-task audit entries are written for every affected task in the same
    transaction before the label disappears, preserving history.
    """
    label = repository.get_label_for_user(db, label_id, actor_id)
    if label is None:
        raise _not_found("Label not found")
    for link in repository.list_label_links(db, label.id):
        repository.add_activity(
            db,
            task_id=link.task_id,
            actor_id=actor_id,
            action="label_removed",
            old_value=_snap({"label_id": label.id, "label_name": label.name}),
            new_value=None,
        )
    # Links cascade via the ORM relationship (all, delete-orphan) and via
    # the DB FK; the audit entries above were written before the delete.
    db.delete(label)
    _commit(
        db,
        conflict_detail="Could not delete the label",
        conflict_status=status.HTTP_400_BAD_REQUEST,
    )


def attach_label(db: Session, actor_id: int, task_id: int, label_id: int) -> Task:
    """Attach one of the actor's own labels to a task (owner-only,
    idempotent; the unique pair index backs the idempotency)."""
    task = _owned_task(db, actor_id, task_id)
    label = repository.get_label_for_user(db, label_id, actor_id)
    if label is None:
        raise _not_found("Label not found")
    if repository.get_label_link(db, task.id, label.id) is not None:
        return task
    repository.attach_label(db, task_id=task.id, label_id=label.id)
    repository.add_activity(
        db,
        task_id=task.id,
        actor_id=actor_id,
        action="label_added",
        old_value=None,
        new_value=_snap({"label_id": label.id, "label_name": label.name}),
    )
    _commit(
        db,
        conflict_detail="Label is already attached to this task",
        conflict_status=status.HTTP_409_CONFLICT,
    )
    db.refresh(task)
    return task


def detach_label(db: Session, actor_id: int, task_id: int, label_id: int) -> Task:
    task = _owned_task(db, actor_id, task_id)
    label = repository.get_label_for_user(db, label_id, actor_id)
    if label is None:
        raise _not_found("Label not found")
    link = repository.get_label_link(db, task.id, label.id)
    if link is None:
        return task
    repository.detach_label(db, link)
    repository.add_activity(
        db,
        task_id=task.id,
        actor_id=actor_id,
        action="label_removed",
        old_value=_snap({"label_id": label.id, "label_name": label.name}),
        new_value=None,
    )
    _commit(
        db,
        conflict_detail="Could not detach the label",
        conflict_status=status.HTTP_400_BAD_REQUEST,
    )
    db.refresh(task)
    return task
