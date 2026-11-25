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

from ..auth.models import User
from . import permissions, repository
from .models import DONE_STATUS, TASK_PRIORITIES, TASK_STATUSES, Task, TaskChecklistItem
from ..project import activity as project_activity
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
    # Canonical workspace association access
    from ..workspace import repository as ws_repo
    from ..workspace import permissions as ws_permissions
    from ..docs.models import Workspace

    ws_ids = ws_repo.get_resource_workspace_ids(db, "task", task.id)
    if ws_ids:
        best = permissions.ROLE_NONE
        for ws_id in ws_ids:
            ws = db.get(Workspace, ws_id)
            if ws is None:
                continue
            if ws.owner_id == actor_id:
                return permissions.ROLE_OWNER
            if ws.workspace_type == "personal":
                continue
            member = ws_repo.get_member(db, ws.id, actor_id)
            role = ws_permissions.workspace_role(ws, actor_id, member.role if member else None)
            if not ws_permissions.can_view(role):
                continue
            if ws_permissions.can_manage_content(role):
                return permissions.ROLE_OWNER
            best = permissions.ROLE_PROJECT_VIEWER
        if best != permissions.ROLE_NONE:
            return best
        # associated but no accessible workspace -> invisible
        return permissions.ROLE_NONE

    # Legacy fallback (pre-migration / missing associations)
    if task.project_id is not None:
        prole = _project_role_for_task(db, task, actor_id)
        if not project_permissions.can_view(prole):
            return permissions.ROLE_NONE
        if project_permissions.can_manage_project_content(prole):
            return permissions.ROLE_OWNER
        return permissions.ROLE_PROJECT_VIEWER
    return permissions.task_role(task, actor_id)


def _create_task_created_notifications(db: Session, task: Task, actor_id: int) -> None:
    """Persist task-created notifications for creator and active assignees.

    Recipients are deduplicated by user id. Notifications are added to the
    current transaction; caller controls commit/rollback.
    """
    from ..notifications.models import Notification

    recipient_ids: set[int] = {actor_id}
    for assignment in getattr(task, "assignments", []) or []:
        if getattr(assignment, "assignment_status", None) == "active":
            recipient_ids.add(assignment.assigned_user_id)

    title = "New task created"
    message = f'Task "{task.title}" was created.'
    for user_id in sorted(recipient_ids):
        db.add(
            Notification(
                user_id=user_id,
                type="task_created",
                title=title,
                message=message,
                task_id=task.id,
            )
        )


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


def _task_workspaces_map(db: Session, actor_id: int, task_ids: list[int]) -> dict[int, list[dict]]:
    from ..workspace import repository as ws_repo
    return ws_repo.list_resource_workspaces_for_actor(db, "task", task_ids, actor_id)


def attach_task_workspaces(db: Session, actor_id: int, tasks: list[Task]) -> list[dict]:
    ws_map = _task_workspaces_map(db, actor_id, [t.id for t in tasks])
    result = []
    for t in tasks:
        result.append({
            "id": t.id,
            "title": t.title,
            "status": t.status,
            "priority": t.priority,
            "start_date": t.start_date,
            "due_date": t.due_date,
            "completed_at": t.completed_at,
            "parent_task_id": t.parent_task_id,
            "created_by": t.created_by,
            "project_id": t.project_id,
            "position": getattr(t, "position", 0) or 0,
            "priority_position": getattr(t, "priority_position", 0) or 0,
            "checklist_total": int(getattr(t, "checklist_total", 0) or 0),
            "checklist_completed": int(getattr(t, "checklist_completed", 0) or 0),
            "created_at": t.created_at,
            "updated_at": t.updated_at,
            "workspaces": ws_map.get(t.id, []),
        })
    return result


def serialize_task(task: Task, *, actor_id: int | None = None, db: Session | None = None) -> dict:
    """Shape a loaded Task for ``TaskResponse`` (labels flattened from the
    link rows; done in the service so the router stays thin)."""
    workspaces = []
    if actor_id is not None and db is not None:
        workspaces = _task_workspaces_map(db, actor_id, [task.id]).get(task.id, [])
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
        "position": task.position,
        "priority_position": getattr(task, "priority_position", 0) or 0,
        "checklist_total": int(getattr(task, "checklist_total", 0) or 0),
        "checklist_completed": int(getattr(task, "checklist_completed", 0) or 0),
        "created_at": task.created_at,
        "updated_at": task.updated_at,
        "labels": [link.label for link in task.label_assignments],
        "assignments": list(task.assignments),
        "workspaces": workspaces,
    }


# ---------------------------------------------------------------------------
# Tasks: create / read / list / update / delete
# ---------------------------------------------------------------------------


def _resolve_task_workspace_id(db: Session, actor_id: int, *, workspace_id: int | None, project_id: int | None) -> int:
    from ..workspace import service as ws_service
    from ..workspace import repository as ws_repo
    from ..workspace import permissions as ws_permissions

    if workspace_id is not None:
        ws, role = ws_service.get_accessible_workspace(db, workspace_id, actor_id)
        if not ws_permissions.can_create_resource(role):
            raise _forbidden("Not allowed to create resources in this workspace")
        if project_id is not None and ws.workspace_type == "shared":
            # if project-bound, ensure project belongs to same workspace when possible
            from ..project.models import Project
            project = db.get(Project, project_id)
            if project is not None and project.workspace_id is not None and project.workspace_id != ws.id:
                raise _bad_request("workspace_id does not match the project workspace")
        return ws.id
    if project_id is not None:
        from ..project.models import Project
        project = db.get(Project, project_id)
        if project is not None and project.workspace_id is not None:
            ws, role = ws_service.get_accessible_workspace(db, project.workspace_id, actor_id)
            if not ws_permissions.can_create_resource(role):
                raise _forbidden("Not allowed to create resources in this workspace")
            return ws.id
    # fallback to personal workspace for compatibility
    from ..workspace import repository as ws_repo
    personal = ws_repo.get_personal_workspace_for_user(db, actor_id)
    if personal is None:
        raise _bad_request("Personal workspace not found")
    return personal.id


def _ensure_task_workspace_association(db: Session, task: Task, workspace_id: int) -> None:
    from ..workspace import repository as ws_repo
    if not ws_repo.has_resource_workspace(db, "task", task.id, workspace_id):
        ws_repo.add_resource_workspace(db, "task", task.id, workspace_id)


def create_task(db: Session, actor_id: int, data: TaskCreate) -> Task:
    """Create a task owned by the authenticated actor (rule: every task has
    an authenticated creator; ids from the request body are never trusted)."""
    _validate_dates(data.start_date, data.due_date)
    project_id = getattr(data, "project_id", None)
    workspace_id = getattr(data, "workspace_id", None)
    if project_id is not None:
        project_service.require_project_manage(db, actor_id, project_id)
    resolved_workspace_id = _resolve_task_workspace_id(
        db, actor_id, workspace_id=workspace_id, project_id=project_id
    )
    repository.list_status_task_ids_for_update(db, "todo")
    todo_neighbors = repository.get_status_position_neighbors(db, status="todo")
    next_position = (todo_neighbors[-1][1] + _POSITION_GAP) if todo_neighbors else _POSITION_GAP
    repository.list_priority_task_ids_for_update(db, data.priority)
    priority_neighbors = repository.get_priority_position_neighbors(db, priority=data.priority)
    next_priority_position = (priority_neighbors[-1][1] + _POSITION_GAP) if priority_neighbors else _POSITION_GAP
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
        position=next_position,
        priority_position=next_priority_position,
    )
    _ensure_task_workspace_association(db, task, resolved_workspace_id)
    repository.add_activity(
        db,
        task_id=task.id,
        actor_id=actor_id,
        action="task_created",
        old_value=None,
        new_value=_snap({"id": task.id, "title": task.title}),
    )
    if task.project_id is not None:
        project_activity.record(
            db,
            project_id=task.project_id,
            actor_id=actor_id,
            event_type=project_activity.TASK_CREATED,
            entity_type="task",
            entity_id=task.id,
            metadata={"task_id": task.id, "task_title": task.title},
        )
    else:
        # Workspace-only tasks never reach the project activity bridge.
        from ..workspace import activity as ws_activity
        from ..workspace import repository as ws_repository
        ws_activity.record(
            db,
            workspace_ids=ws_repository.list_resource_workspace_ids(db, "task", task.id),
            actor_id=actor_id,
            event_type=ws_activity.TASK_CREATED,
            entity_type="task",
            entity_id=task.id,
            metadata={"resource_name": task.title},
        )
    _create_task_created_notifications(db, task, actor_id)
    _commit(
        db,
        conflict_detail="Could not create the task",
        conflict_status=status.HTTP_400_BAD_REQUEST,
    )
    db.refresh(task)
    repository.populate_checklist_counts(db, [task])
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
    repository.list_status_task_ids_for_update(db, "todo")
    todo_neighbors = repository.get_status_position_neighbors(db, status="todo")
    next_position = (todo_neighbors[-1][1] + _POSITION_GAP) if todo_neighbors else _POSITION_GAP
    repository.list_priority_task_ids_for_update(db, data.priority)
    priority_neighbors = repository.get_priority_position_neighbors(db, priority=data.priority)
    next_priority_position = (priority_neighbors[-1][1] + _POSITION_GAP) if priority_neighbors else _POSITION_GAP
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
        position=next_position,
        priority_position=next_priority_position,
    )
    from ..workspace import repository as ws_repo
    parent_ws_ids = ws_repo.get_resource_workspace_ids(db, "task", parent.id)
    if not parent_ws_ids:
        resolved_workspace_id = _resolve_task_workspace_id(db, actor_id, workspace_id=getattr(data, "workspace_id", None), project_id=parent.project_id)
        parent_ws_ids = [resolved_workspace_id]
    for ws_id in parent_ws_ids:
        _ensure_task_workspace_association(db, task, ws_id)
    repository.add_activity(
        db,
        task_id=task.id,
        actor_id=actor_id,
        action="task_created",
        old_value=None,
        new_value=_snap({"id": task.id, "title": task.title, "parent": parent.id}),
    )
    if task.project_id is not None:
        project_activity.record(
            db,
            project_id=task.project_id,
            actor_id=actor_id,
            event_type=project_activity.TASK_CREATED,
            entity_type="task",
            entity_id=task.id,
            metadata={"task_id": task.id, "task_title": task.title},
        )
    _create_task_created_notifications(db, task, actor_id)
    _commit(
        db,
        conflict_detail="Could not create the subtask",
        conflict_status=status.HTTP_400_BAD_REQUEST,
    )
    db.refresh(task)
    repository.populate_checklist_counts(db, [task])
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
    if getattr(flt, "workspace_id", None) is not None:
        from ..workspace import service as ws_service
        ws_service.get_accessible_workspace(db, flt.workspace_id, actor_id)
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

    # If priority changed via edit, append to destination priority column so
    # priority-board ordering stays consistent. Status changes are handled by
    # the dedicated status/position endpoint.
    if "priority" in updates and updates["priority"] != task.priority:
        new_priority = updates["priority"]
        repository.list_priority_task_ids_for_update(db, new_priority)
        priority_neighbors = repository.get_priority_position_neighbors(db, priority=new_priority, exclude_task_id=task.id)
        updates["priority_position"] = (priority_neighbors[-1][1] + _POSITION_GAP) if priority_neighbors else _POSITION_GAP

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
    if changed:
        from ..workspace import activity as ws_activity
        from ..workspace import repository as ws_repository
        field_actions = {field: action for field, action, _old, _new in changed}
        if "title" in field_actions:
            event_type = ws_activity.TASK_TITLE_CHANGED
        elif "description" in field_actions:
            event_type = ws_activity.TASK_DESCRIPTION_CHANGED
        elif "due_date" in field_actions:
            event_type = ws_activity.TASK_DUE_DATE_CHANGED
        elif "priority" in field_actions:
            event_type = ws_activity.TASK_PRIORITY_CHANGED
        else:
            event_type = ws_activity.TASK_UPDATED
        ws_activity.record(
            db,
            workspace_ids=ws_repository.list_resource_workspace_ids(db, "task", task.id),
            actor_id=actor_id,
            event_type=event_type,
            entity_type="task",
            entity_id=task.id,
            metadata={
                "resource_name": task.title,
                "fields": [field for field, _action, _old, _new in changed],
            },
        )
    _commit(
        db,
        conflict_detail="Could not update the task",
        conflict_status=status.HTTP_400_BAD_REQUEST,
    )
    db.refresh(task)
    repository.populate_checklist_counts(db, [task])
    return task


def delete_task(db: Session, actor_id: int, task_id: int) -> None:
    """Delete a task everywhere.

    Authorized: resource creator, or an owner of an associated shared/personal workspace.
    """
    task, _role = _visible_task(db, actor_id, task_id)
    from ..workspace import service as ws_service
    if not ws_service.can_delete_resource_everywhere(db, actor_id, "task", task):
        raise _forbidden("Not allowed to delete this task everywhere")
    repository.add_activity(
        db,
        task_id=task.id,
        actor_id=actor_id,
        action="task_deleted",
        old_value=None,
        new_value=_snap({"id": task.id, "title": task.title}),
    )
    from ..workspace import activity as ws_activity
    from ..workspace import repository as ws_repository
    ws_activity.record(
        db,
        workspace_ids=ws_repository.list_resource_workspace_ids(db, "task", task.id),
        actor_id=actor_id,
        event_type=ws_activity.TASK_DELETED,
        entity_type="task",
        entity_id=task.id,
        metadata={"resource_name": task.title},
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


_POSITION_GAP = 1000


def _normalize_status_positions(db: Session, status: str) -> dict[int, int]:
    """Reassign deterministic gap positions for all tasks in a status."""
    task_ids = repository.list_status_task_ids_for_update(db, status)
    positions: dict[int, int] = {}
    for index, tid in enumerate(task_ids, start=1):
        positions[tid] = index * _POSITION_GAP
    if not positions:
        return positions
    for tid, pos in positions.items():
        db.execute(
            Task.__table__.update().where(Task.id == tid).values(position=pos)
        )
    db.flush()
    return positions


def _normalize_priority_positions(db: Session, priority: str) -> dict[int, int]:
    """Reassign deterministic gap positions for all tasks in a priority column."""
    task_ids = repository.list_priority_task_ids_for_update(db, priority)
    positions: dict[int, int] = {}
    for index, tid in enumerate(task_ids, start=1):
        positions[tid] = index * _POSITION_GAP
    if not positions:
        return positions
    for tid, pos in positions.items():
        db.execute(
            Task.__table__.update().where(Task.id == tid).values(priority_position=pos)
        )
    db.flush()
    return positions


def _compute_target_position(
    db: Session,
    *,
    task_id: int,
    target_status: str,
    before_task_id: int | None,
    after_task_id: int | None,
) -> int:
    """Compute a new position in target_status."""
    if before_task_id == task_id or after_task_id == task_id:
        raise _bad_request("A task cannot be positioned relative to itself")

    neighbors = repository.get_status_position_neighbors(
        db, status=target_status, exclude_task_id=task_id
    )
    positions_by_id = {tid: pos for tid, pos in neighbors}
    ordered_ids = [tid for tid, _pos in neighbors]

    for neighbor_id, label in ((before_task_id, "before_task_id"), (after_task_id, "after_task_id")):
        if neighbor_id is not None and neighbor_id not in positions_by_id:
            neighbor = repository.get_task(db, neighbor_id, eager=False)
            if neighbor is None:
                raise _bad_request(f"Unknown {label}")
            if neighbor.status != target_status:
                raise _bad_request(f"{label} must belong to the target status column")
            raise _bad_request(f"Invalid {label}")

    if before_task_id is not None and after_task_id is not None:
        if ordered_ids.index(before_task_id) > ordered_ids.index(after_task_id):
            raise _bad_request("before_task_id must come before after_task_id")

    # Resolve effective bounds from the actual neighbor order so a one-sided
    # insertion does not collide with the adjacent occupied slot.
    if before_task_id is None and after_task_id is None:
        if not ordered_ids:
            return _POSITION_GAP
        return positions_by_id[ordered_ids[-1]] + _POSITION_GAP

    if before_task_id is not None and after_task_id is not None:
        lower_id, upper_id = before_task_id, after_task_id
    elif before_task_id is not None:
        lower_id = before_task_id
        idx = ordered_ids.index(before_task_id)
        upper_id = ordered_ids[idx + 1] if idx + 1 < len(ordered_ids) else None
    else:
        upper_id = after_task_id
        idx = ordered_ids.index(after_task_id)
        lower_id = ordered_ids[idx - 1] if idx > 0 else None

    def _bounds(ids_to_pos: dict[int, int]) -> tuple[int | None, int | None]:
        lower = ids_to_pos.get(lower_id) if lower_id is not None else None
        upper = ids_to_pos.get(upper_id) if upper_id is not None else None
        return lower, upper

    lower, upper = _bounds(positions_by_id)
    if lower is None and upper is None:
        return _POSITION_GAP
    if lower is None:
        if upper is not None and upper - _POSITION_GAP >= 1:
            # Keep a gap from the start while preserving order.
            candidate = upper - _POSITION_GAP
            if candidate >= 1:
                return candidate
        return max(1, (upper or _POSITION_GAP) - 1)
    if upper is None:
        return lower + _POSITION_GAP
    if upper - lower > 1:
        return lower + ((upper - lower) // 2)

    new_positions = _normalize_status_positions(db, target_status)
    lower, upper = _bounds(new_positions)
    if lower is None or upper is None:
        raise _bad_request("Could not compute task position")
    if upper - lower > 1:
        return lower + ((upper - lower) // 2)
    _normalize_status_positions(db, target_status)
    refreshed = repository.get_status_position_neighbors(
        db, status=target_status, exclude_task_id=task_id
    )
    refreshed_positions = {tid: pos for tid, pos in refreshed}
    lower, upper = _bounds(refreshed_positions)
    if lower is None or upper is None:
        raise _bad_request("Could not compute task position")
    return lower + max(1, (upper - lower) // 2)


def _compute_target_priority_position(
    db: Session,
    *,
    task_id: int,
    target_priority: str,
    before_task_id: int | None,
    after_task_id: int | None,
) -> int:
    """Compute a new priority_position in target_priority."""
    if before_task_id == task_id or after_task_id == task_id:
        raise _bad_request("A task cannot be positioned relative to itself")

    neighbors = repository.get_priority_position_neighbors(
        db, priority=target_priority, exclude_task_id=task_id
    )
    positions_by_id = {tid: pos for tid, pos in neighbors}
    ordered_ids = [tid for tid, _pos in neighbors]

    for neighbor_id, label in ((before_task_id, "before_task_id"), (after_task_id, "after_task_id")):
        if neighbor_id is not None and neighbor_id not in positions_by_id:
            neighbor = repository.get_task(db, neighbor_id, eager=False)
            if neighbor is None:
                raise _bad_request(f"Unknown {label}")
            if neighbor.priority != target_priority:
                raise _bad_request(f"{label} must belong to the target priority column")
            raise _bad_request(f"Invalid {label}")

    if before_task_id is not None and after_task_id is not None:
        if ordered_ids.index(before_task_id) > ordered_ids.index(after_task_id):
            raise _bad_request("before_task_id must come before after_task_id")

    # Resolve effective bounds from the actual neighbor order so a one-sided
    # insertion does not collide with the adjacent occupied slot.
    if before_task_id is None and after_task_id is None:
        if not ordered_ids:
            return _POSITION_GAP
        return positions_by_id[ordered_ids[-1]] + _POSITION_GAP

    if before_task_id is not None and after_task_id is not None:
        lower_id, upper_id = before_task_id, after_task_id
    elif before_task_id is not None:
        lower_id = before_task_id
        idx = ordered_ids.index(before_task_id)
        upper_id = ordered_ids[idx + 1] if idx + 1 < len(ordered_ids) else None
    else:
        upper_id = after_task_id
        idx = ordered_ids.index(after_task_id)
        lower_id = ordered_ids[idx - 1] if idx > 0 else None

    def _bounds(ids_to_pos: dict[int, int]) -> tuple[int | None, int | None]:
        lower = ids_to_pos.get(lower_id) if lower_id is not None else None
        upper = ids_to_pos.get(upper_id) if upper_id is not None else None
        return lower, upper

    lower, upper = _bounds(positions_by_id)
    if lower is None and upper is None:
        return _POSITION_GAP
    if lower is None:
        if upper is not None and upper - _POSITION_GAP >= 1:
            candidate = upper - _POSITION_GAP
            if candidate >= 1:
                return candidate
        return max(1, (upper or _POSITION_GAP) - 1)
    if upper is None:
        return lower + _POSITION_GAP
    if upper - lower > 1:
        return lower + ((upper - lower) // 2)

    new_positions = _normalize_priority_positions(db, target_priority)
    lower, upper = _bounds(new_positions)
    if lower is None or upper is None:
        raise _bad_request("Could not compute task position")
    if upper - lower > 1:
        return lower + ((upper - lower) // 2)
    _normalize_priority_positions(db, target_priority)
    refreshed = repository.get_priority_position_neighbors(
        db, priority=target_priority, exclude_task_id=task_id
    )
    refreshed_positions = {tid: pos for tid, pos in refreshed}
    lower, upper = _bounds(refreshed_positions)
    if lower is None or upper is None:
        raise _bad_request("Could not compute task position")
    return lower + max(1, (upper - lower) // 2)


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

    # Append to destination column to keep Kanban ordering deterministic.
    repository.list_status_task_ids_for_update(db, new_status)
    neighbors = repository.get_status_position_neighbors(db, status=new_status, exclude_task_id=task.id)
    next_position = (neighbors[-1][1] + _POSITION_GAP) if neighbors else _POSITION_GAP

    task.status = new_status
    task.position = next_position
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
    if new_status == DONE_STATUS and task.project_id is not None:
        project_activity.record(
            db,
            project_id=task.project_id,
            actor_id=actor_id,
            event_type=project_activity.TASK_COMPLETED,
            entity_type="task",
            entity_id=task.id,
            metadata={"task_id": task.id, "task_title": task.title},
        )
    if old_status == DONE_STATUS and new_status != DONE_STATUS:
        from ..workspace import activity as ws_activity
        from ..workspace import repository as ws_repository
        ws_activity.record(
            db,
            workspace_ids=ws_repository.list_resource_workspace_ids(db, "task", task.id),
            actor_id=actor_id,
            event_type=ws_activity.TASK_REOPENED,
            entity_type="task",
            entity_id=task.id,
            metadata={"resource_name": task.title},
        )
    _commit(
        db,
        conflict_detail="Could not update the task status",
        conflict_status=status.HTTP_400_BAD_REQUEST,
    )
    db.refresh(task)
    repository.populate_checklist_counts(db, [task])
    return task


def set_task_position(
    db: Session,
    actor_id: int,
    task_id: int,
    *,
    target_status: str | None = None,
    target_priority: str | None = None,
    before_task_id: int | None = None,
    after_task_id: int | None = None,
) -> Task:
    """Reorder a task within/between status columns or priority columns.

    Status mode (target_status): preserves existing behavior - may change
    status and status-position; never changes priority. Enforces status
    transition rules and completed_at invariants.

    Priority mode (target_priority): changes priority and/or priority_position;
    never changes status.
    """
    has_status = target_status is not None
    has_priority = target_priority is not None
    if has_status == has_priority:
        raise _bad_request("Provide exactly one of target_status or target_priority")

    task, role = _visible_task(db, actor_id, task_id)

    if has_status:
        if not permissions.can_change_status(role):
            raise _forbidden("Not allowed to change this task's status")
        if target_status not in TASK_STATUSES:
            raise _bad_request(f"Unknown task status: {target_status}")

        old_status = task.status
        old_position = task.position
        if target_status != old_status:
            if target_status not in ALLOWED_STATUS_TRANSITIONS[old_status]:
                raise _bad_request(
                    f"Invalid status transition from '{old_status}' to '{target_status}'"
                )

        repository.list_status_task_ids_for_update(db, target_status)
        if old_status != target_status:
            repository.list_status_task_ids_for_update(db, old_status)

        new_position = _compute_target_position(
            db,
            task_id=task.id,
            target_status=target_status,
            before_task_id=before_task_id,
            after_task_id=after_task_id,
        )

        if target_status == old_status and new_position == old_position:
            db.refresh(task)
            return task

        status_changed = target_status != old_status
        task.status = target_status
        task.position = new_position
        if status_changed:
            if target_status == DONE_STATUS:
                task.completed_at = datetime.now(timezone.utc)
            else:
                task.completed_at = None
            repository.add_activity(
                db,
                task_id=task.id,
                actor_id=actor_id,
                action="status_changed",
                old_value=old_status,
                new_value=target_status,
            )

        repository.add_activity(
            db,
            task_id=task.id,
            actor_id=actor_id,
            action="task_updated",
            old_value=_snap({"status": old_status, "position": old_position}),
            new_value=_snap({"status": target_status, "position": new_position}),
        )

        _commit(
            db,
            conflict_detail="Could not update task position",
            conflict_status=status.HTTP_400_BAD_REQUEST,
        )
        db.refresh(task)
        return task

    # Priority mode
    if not permissions.can_edit(role):
        raise _forbidden("Not allowed to change this task's priority")
    if target_priority not in TASK_PRIORITIES:
        raise _bad_request(f"Unknown task priority: {target_priority}")

    old_priority = task.priority
    old_priority_position = getattr(task, "priority_position", 0) or 0

    repository.list_priority_task_ids_for_update(db, target_priority)
    if old_priority != target_priority:
        repository.list_priority_task_ids_for_update(db, old_priority)

    new_priority_position = _compute_target_priority_position(
        db,
        task_id=task.id,
        target_priority=target_priority,
        before_task_id=before_task_id,
        after_task_id=after_task_id,
    )

    if target_priority == old_priority and new_priority_position == old_priority_position:
        db.refresh(task)
        return task

    task.priority = target_priority
    task.priority_position = new_priority_position

    repository.add_activity(
        db,
        task_id=task.id,
        actor_id=actor_id,
        action="task_updated",
        old_value=_snap({"priority": old_priority, "priority_position": old_priority_position}),
        new_value=_snap({"priority": target_priority, "priority_position": new_priority_position}),
    )

    _commit(
        db,
        conflict_detail="Could not update task priority position",
        conflict_status=status.HTTP_400_BAD_REQUEST,
    )
    db.refresh(task)
    repository.populate_checklist_counts(db, [task])
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
    repository.populate_checklist_counts(db, [task])
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


def task_statistics(db: Session, actor_id: int, project_id: int | None = None) -> dict:
    """Aggregated counters for the actor's visible tasks.

    Computed at the SQL level (repository) and completed here with the
    derived metrics the API contract exposes.
    """
    stats = repository.task_statistics(db, actor_id, project_id=project_id)
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

    previous_active_ids = [
        a.assigned_user_id
        for a in task.assignments
        if a.assignment_status == "active"
    ]

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

    if task.project_id is not None:
        new_active_ids = sorted(set(previous_active_ids) | {target_user_id})
        user_ids = sorted(set(previous_active_ids) | set(new_active_ids))
        users = {
            u.id: u
            for u in db.query(User).filter(User.id.in_(user_ids)).all()
        } if user_ids else {}

        def _assignee_info(uid: int) -> dict:
            u = users.get(uid)
            return {
                "user_id": uid,
                "username": getattr(u, "username", None) if u else None,
                "name": getattr(u, "name", None) if u else None,
            }

        project_activity.record(
            db,
            project_id=task.project_id,
            actor_id=actor_id,
            event_type=project_activity.TASK_REASSIGNED,
            entity_type="task",
            entity_id=task.id,
            metadata={
                "task_id": task.id,
                "task_title": task.title,
                "previous_assignees": [_assignee_info(uid) for uid in previous_active_ids],
                "new_assignees": [_assignee_info(uid) for uid in new_active_ids],
            },
        )

    _commit(
        db,
        conflict_detail="User is already assigned to this task",
        conflict_status=status.HTTP_409_CONFLICT,
    )
    db.refresh(task)
    repository.populate_checklist_counts(db, [task])
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

    previous_active_ids = [
        a.assigned_user_id
        for a in task.assignments
        if a.assignment_status == "active"
    ]

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

    if task.project_id is not None:
        user_ids = sorted(set(previous_active_ids) | {target_user_id})
        users = {
            u.id: u
            for u in db.query(User).filter(User.id.in_(user_ids)).all()
        } if user_ids else {}

        def _assignee_info(uid: int) -> dict:
            u = users.get(uid)
            return {
                "user_id": uid,
                "username": getattr(u, "username", None) if u else None,
                "name": getattr(u, "name", None) if u else None,
            }

        project_activity.record(
            db,
            project_id=task.project_id,
            actor_id=actor_id,
            event_type=project_activity.TASK_REASSIGNED,
            entity_type="task",
            entity_id=task.id,
            metadata={
                "task_id": task.id,
                "task_title": task.title,
                "previous_assignees": [_assignee_info(uid) for uid in previous_active_ids],
                "new_assignees": [_assignee_info(target_user_id)],
                "new_assignee": _assignee_info(target_user_id),
            },
        )

    _commit(
        db,
        conflict_detail="User is already assigned to this task",
        conflict_status=status.HTTP_409_CONFLICT,
    )
    db.refresh(task)
    repository.populate_checklist_counts(db, [task])
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

    previous_active_ids = [
        a.assigned_user_id
        for a in task.assignments
        if a.assignment_status == "active"
    ]

    assignment.assignment_status = "cancelled"
    repository.add_activity(
        db,
        task_id=task.id,
        actor_id=actor_id,
        action="assignee_removed",
        old_value=_snap({"user_id": target_user_id}),
        new_value=None,
    )

    if task.project_id is not None:
        new_active_ids = [uid for uid in previous_active_ids if uid != target_user_id]
        user_ids = sorted(set(previous_active_ids) | set(new_active_ids))
        users = {
            u.id: u
            for u in db.query(User).filter(User.id.in_(user_ids)).all()
        } if user_ids else {}

        def _assignee_info(uid: int) -> dict:
            u = users.get(uid)
            return {
                "user_id": uid,
                "username": getattr(u, "username", None) if u else None,
                "name": getattr(u, "name", None) if u else None,
            }

        project_activity.record(
            db,
            project_id=task.project_id,
            actor_id=actor_id,
            event_type=project_activity.TASK_REASSIGNED,
            entity_type="task",
            entity_id=task.id,
            metadata={
                "task_id": task.id,
                "task_title": task.title,
                "previous_assignees": [_assignee_info(uid) for uid in previous_active_ids],
                "new_assignees": [_assignee_info(uid) for uid in new_active_ids],
            },
        )

    _commit(
        db,
        conflict_detail="Could not update the assignment",
        conflict_status=status.HTTP_400_BAD_REQUEST,
    )
    db.refresh(task)
    repository.populate_checklist_counts(db, [task])
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
    repository.populate_checklist_counts(db, [task])
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
    repository.populate_checklist_counts(db, [task])
    return task


# ---------------------------------------------------------------------------
# Workspace associations (Phase 3)
# ---------------------------------------------------------------------------


def list_task_workspaces(db: Session, actor_id: int, task_id: int) -> list[int]:
    from ..workspace import service as ws_service
    return ws_service.list_resource_workspaces(db, actor_id, "task", task_id)


def attach_task_to_workspace(db: Session, actor_id: int, task_id: int, workspace_id: int) -> dict:
    from ..workspace import service as ws_service
    return ws_service.attach_resource_to_workspace(db, actor_id, "task", task_id, workspace_id)


def detach_task_from_workspace(db: Session, actor_id: int, task_id: int, workspace_id: int) -> dict:
    from ..workspace import service as ws_service
    return ws_service.detach_resource_from_workspace(db, actor_id, "task", task_id, workspace_id)


# ---------------------------------------------------------------------------
# Checklist
# ---------------------------------------------------------------------------


def _checklist_item_not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Checklist item not found")


def list_checklist_items(db: Session, actor_id: int, task_id: int):
    task, role = _visible_task(db, actor_id, task_id)
    if not permissions.can_view(role):
        raise _not_found()
    return repository.list_checklist_items(db, task.id)


def create_checklist_item(db: Session, actor_id: int, task_id: int, *, title: str):
    task = _owned_task(db, actor_id, task_id)
    trimmed = (title or "").strip()
    if not trimmed:
        raise _bad_request("Checklist item title must not be empty")
    if len(trimmed) > 200:
        raise _bad_request("Checklist item title must be at most 200 characters")
    max_pos = repository.get_max_checklist_position(db, task.id)
    position = (int(max_pos) + 1000) if max_pos is not None else 1000
    item = repository.create_checklist_item(db, task_id=task.id, title=trimmed, position=position)
    repository.add_activity(
        db,
        task_id=task.id,
        actor_id=actor_id,
        action="task_updated",
        old_value=None,
        new_value=_snap({"checklist_item_added": item.id, "title": trimmed}),
    )
    _commit(
        db,
        conflict_detail="Could not create the checklist item",
        conflict_status=status.HTTP_400_BAD_REQUEST,
    )
    db.refresh(item)
    return item


def update_checklist_item(db: Session, actor_id: int, task_id: int, item_id: int, *, data):
    task = _owned_task(db, actor_id, task_id)
    item = repository.get_checklist_item(db, task.id, item_id)
    if item is None:
        raise _checklist_item_not_found()
    updates = data.model_dump(exclude_unset=True)
    changed = False
    if "title" in updates:
        title = updates["title"]
        if title is None:
            raise _bad_request("Checklist item title must not be empty")
        trimmed = title.strip()
        if not trimmed:
            raise _bad_request("Checklist item title must not be empty")
        if len(trimmed) > 200:
            raise _bad_request("Checklist item title must be at most 200 characters")
        if trimmed != item.title:
            item.title = trimmed
            changed = True
    if "is_completed" in updates and updates["is_completed"] is not None:
        if bool(updates["is_completed"]) != bool(item.is_completed):
            item.is_completed = bool(updates["is_completed"])
            changed = True
    if not changed:
        return item
    repository.add_activity(
        db,
        task_id=task.id,
        actor_id=actor_id,
        action="task_updated",
        old_value=None,
        new_value=_snap({"checklist_item_updated": item.id, "is_completed": item.is_completed}),
    )
    _commit(
        db,
        conflict_detail="Could not update the checklist item",
        conflict_status=status.HTTP_400_BAD_REQUEST,
    )
    db.refresh(item)
    return item


def delete_checklist_item(db: Session, actor_id: int, task_id: int, item_id: int) -> None:
    task = _owned_task(db, actor_id, task_id)
    item = repository.get_checklist_item(db, task.id, item_id)
    if item is None:
        raise _checklist_item_not_found()
    repository.delete_checklist_item(db, item)
    repository.add_activity(
        db,
        task_id=task.id,
        actor_id=actor_id,
        action="task_updated",
        old_value=_snap({"checklist_item_deleted": item_id}),
        new_value=None,
    )
    _commit(
        db,
        conflict_detail="Could not delete the checklist item",
        conflict_status=status.HTTP_400_BAD_REQUEST,
    )


def reorder_checklist_items(db: Session, actor_id: int, task_id: int, *, item_ids: list[int]):
    task = _owned_task(db, actor_id, task_id)
    # Lock existing rows for deterministic reorder.
    existing_ids = repository.list_checklist_item_ids_for_update(db, task.id)
    existing_set = set(existing_ids)
    submitted_set = set(item_ids)
    if len(item_ids) != len(submitted_set):
        raise _bad_request("Duplicate checklist item ids are not allowed")
    if not existing_set:
        raise _bad_request("Task has no checklist items to reorder")
    if submitted_set != existing_set:
        unknown = submitted_set - existing_set
        if unknown:
            raise _bad_request("Checklist reorder must include exactly the task's checklist items")
        raise _bad_request("Checklist reorder must include exactly the task's checklist items")
    if item_ids == existing_ids:
        return repository.list_checklist_items(db, task.id)

    # Two-phase position update to avoid transient unique conflicts if any constraint exists.
    offset = 1_000_000_000
    for idx, cid in enumerate(item_ids, start=1):
        db.execute(
            TaskChecklistItem.__table__.update()
            .where(TaskChecklistItem.task_id == task.id, TaskChecklistItem.id == cid)
            .values(position=offset + idx)
        )
    db.flush()
    for idx, cid in enumerate(item_ids, start=1):
        db.execute(
            TaskChecklistItem.__table__.update()
            .where(TaskChecklistItem.task_id == task.id, TaskChecklistItem.id == cid)
            .values(position=idx * 1000)
        )
    repository.add_activity(
        db,
        task_id=task.id,
        actor_id=actor_id,
        action="task_updated",
        old_value=None,
        new_value=_snap({"checklist_reordered": item_ids}),
    )
    _commit(
        db,
        conflict_detail="Could not reorder checklist items",
        conflict_status=status.HTTP_400_BAD_REQUEST,
    )
    return repository.list_checklist_items(db, task.id)
