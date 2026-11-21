"""FastAPI routes for the task module.

Thin HTTP layer: resolves ``Depends(get_db)`` and the authenticated user
from the existing ``get_current_user`` dependency (service/auth), delegates
every rule to ``service.py``, and maps results to Pydantic responses.
Status codes follow the house conventions (201 create, 204 delete,
200 otherwise; errors carry a string ``detail``).

Authorization is object-level and enforced in the service layer:
- invisible/nonexistent resources -> 404 (IDOR-safe: guessed ids reveal
  nothing),
- visible but insufficient permission -> 403.

NOTE on the URL prefix: this module is served under ``/api/tasks`` (per the
approved API specification), unlike the other platform modules which use
bare prefixes (``/auth``, ``/calendars``). The prefix lives here, so
``service/main.py`` requires no change — the router is already imported and
included there.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import ValidationError
from sqlalchemy.orm import Session

from ..auth.dependencies import get_current_user
from ..auth.models import User
from ..core.database import get_db
from . import service
from .schemas import (
    SubtaskCreate,
    TaskActivityListResponse,
    TaskAssignmentCreate,
    TaskCommentCreate,
    TaskCommentListResponse,
    TaskCommentOut,
    TaskCreate,
    TaskFilter,
    TaskLabelCreate,
    TaskLabelListResponse,
    TaskLabelOut,
    TaskLabelUpdate,
    TaskListResponse,
    TaskParentUpdate,
    TaskResponse,
    TaskStatisticsOut,
    TaskStatusUpdate,
    TaskUpdate,
)

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------


def _task_filter(
    status: list[str] = Query(default=[], description="Repeatable status filter"),
    priority: list[str] = Query(default=[], description="Repeatable priority filter"),
    created_by: int | None = Query(default=None, description="Filter by creator"),
    assigned_user_id: int | None = Query(default=None, description="Filter by active assignee"),
    parent_task_id: int | None = Query(default=None, description="Filter by parent task"),
    project_id: int | None = Query(default=None, description="Filter by project"),
    label_id: int | None = Query(default=None, description="Filter by label"),
    due: str | None = Query(default=None, description="overdue | today | upcoming | no_due"),
    q: str | None = Query(default=None, description="Search in title and description"),
    sort: str | None = Query(default=None, description="due_date | created_at | updated_at | priority"),
    order: str = Query(default="asc", description="asc | desc"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> TaskFilter:
    """Build the validated filter object from query parameters.

    Pydantic validation failures are converted to FastAPI-style 422
    responses with a readable detail message.
    """
    try:
        return TaskFilter(
            status=status,
            priority=priority,
            created_by=created_by,
            assigned_user_id=assigned_user_id,
            parent_task_id=parent_task_id,
            project_id=project_id,
            label_id=label_id,
            due=due,
            q=q,
            sort=sort,
            order=order,
            limit=limit,
            offset=offset,
        )
    except ValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail=exc.errors()[0].get("msg", "Invalid filter"),
        )


# ---------------------------------------------------------------------------
# Tasks: create / list / views / statistics
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=TaskResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a task",
    description="Creates a task owned by the authenticated user. Status always starts as 'todo'.",
)
def create_task(
    data: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = service.create_task(db, current_user.id, data)
    return service.serialize_task(task)


@router.get(
    "",
    response_model=TaskListResponse,
    summary="List tasks visible to the caller",
    description=(
        "Paginated, filterable, sortable list. Scopes: 'visible' (default: "
        "created by or actively assigned to the caller, plus one-level "
        "subtask visibility), 'created', 'assigned', 'assigned_by'."
    ),
)
def list_tasks(
    scope: str = Query(default="visible"),
    flt: TaskFilter = Depends(_task_filter),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items, total = service.list_tasks(db, current_user.id, flt, scope=scope)
    return {"items": items, "total": total, "limit": flt.limit, "offset": flt.offset}


@router.get(
    "/my",
    response_model=TaskListResponse,
    summary="Tasks actively assigned to the caller",
)
def list_my_tasks(
    flt: TaskFilter = Depends(_task_filter),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items, total = service.list_tasks(
        db, current_user.id, flt, scope="assigned"
    )
    return {"items": items, "total": total, "limit": flt.limit, "offset": flt.offset}


@router.get(
    "/assigned-by-me",
    response_model=TaskListResponse,
    summary="Tasks the caller actively delegated to others",
    description=(
        "The future manager view: tasks where the caller performed an active "
        "assignment. Until a team model exists, only task owners delegate."
    ),
)
def list_assigned_by_me(
    flt: TaskFilter = Depends(_task_filter),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items, total = service.list_tasks(
        db, current_user.id, flt, scope="assigned_by"
    )
    return {"items": items, "total": total, "limit": flt.limit, "offset": flt.offset}


@router.get(
    "/statistics",
    response_model=TaskStatisticsOut,
    summary="Aggregated counters for the caller's visible tasks",
)
def task_statistics(
    project_id: int | None = Query(default=None, description="Optional project scope"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.task_statistics(db, current_user.id, project_id=project_id)


# ---------------------------------------------------------------------------
# Labels (collection routes must be declared before /{task_id} routes)
# ---------------------------------------------------------------------------


@router.post(
    "/labels",
    response_model=TaskLabelOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a label owned by the caller",
)
def create_label(
    data: TaskLabelCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.create_label(db, current_user.id, data)


@router.get(
    "/labels",
    response_model=TaskLabelListResponse,
    summary="List the caller's labels",
)
def list_labels(
    limit: int = Query(default=100, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items, total = service.list_labels(
        db, current_user.id, limit=limit, offset=offset
    )
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.patch(
    "/labels/{label_id}",
    response_model=TaskLabelOut,
    summary="Rename or recolor the caller's label",
)
def update_label(
    label_id: int,
    data: TaskLabelUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.update_label(db, current_user.id, label_id, data)


@router.delete(
    "/labels/{label_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete the caller's label (attached tasks keep their links removed)",
)
def delete_label(
    label_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service.delete_label(db, current_user.id, label_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Task detail and lifecycle
# ---------------------------------------------------------------------------


@router.get(
    "/{task_id}",
    response_model=TaskResponse,
    summary="Get one task (404 unless the caller may see it)",
)
def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = service.get_task(db, current_user.id, task_id)
    return service.serialize_task(task)


@router.patch(
    "/{task_id}",
    response_model=TaskResponse,
    summary="Update title/description/priority/dates (owner only)",
    description=(
        "Status is intentionally excluded; use PUT /{task_id}/status so the "
        "completed_at invariant is managed in one place."
    ),
)
def update_task(
    task_id: int,
    data: TaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = service.update_task(db, current_user.id, task_id, data)
    return service.serialize_task(task)


@router.delete(
    "/{task_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a task (owner only)",
    description=(
        "Hard delete per platform convention. Subtasks are promoted to top "
        "level; comments/assignments/label links cascade; activity history "
        "is preserved (task_id cleared)."
    ),
)
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service.delete_task(db, current_user.id, task_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put(
    "/{task_id}/status",
    response_model=TaskResponse,
    summary="Apply a validated status transition (owner or active assignee)",
    description=(
        "Valid transitions: todo->in_progress|blocked|done|cancelled, "
        "in_progress->todo|blocked|done|cancelled, blocked->in_progress|done|"
        "cancelled, done->todo|in_progress, cancelled->todo. Same-status is "
        "an idempotent no-op."
    ),
)
def set_task_status(
    task_id: int,
    data: TaskStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = service.set_task_status(db, current_user.id, task_id, data.status)
    return service.serialize_task(task)


@router.put(
    "/{task_id}/parent",
    response_model=TaskResponse,
    summary="Attach, move, or detach the parent (owner only)",
    description="Circular hierarchies are rejected with 400. Pass parent_task_id: null to detach.",
)
def set_task_parent(
    task_id: int,
    data: TaskParentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = service.set_parent_task(db, current_user.id, task_id, data.parent_task_id)
    return service.serialize_task(task)


@router.get(
    "/{task_id}/parent",
    response_model=TaskResponse | None,
    summary="Get the parent task if visible to the caller",
)
def get_task_parent(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    parent = service.get_parent_task(db, current_user.id, task_id)
    return service.serialize_task(parent) if parent is not None else None


# ---------------------------------------------------------------------------
# Subtasks
# ---------------------------------------------------------------------------


@router.post(
    "/{task_id}/subtasks",
    response_model=TaskResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a subtask under an accessible task (owner only)",
)
def create_subtask(
    task_id: int,
    data: SubtaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if data.parent_task_id != task_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="parent_task_id must match the task in the URL",
        )
    task = service.create_subtask(db, current_user.id, task_id, data)
    return service.serialize_task(task)


@router.get(
    "/{task_id}/subtasks",
    response_model=TaskListResponse,
    summary="List subtasks of an accessible task",
)
def list_subtasks(
    task_id: int,
    flt: TaskFilter = Depends(_task_filter),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items, total = service.list_subtasks(db, current_user.id, task_id, flt)
    return {"items": items, "total": total, "limit": flt.limit, "offset": flt.offset}


# ---------------------------------------------------------------------------
# Assignments
# ---------------------------------------------------------------------------


@router.post(
    "/{task_id}/assignments",
    response_model=TaskResponse,
    summary="Assign a user to a task (owner only)",
    description=(
        "Idempotent: an already-active assignment is a no-op; a cancelled "
        "one is reactivated in place (history preserved). Returns the "
        "updated task with its assignments."
    ),
)
def assign_user(
    task_id: int,
    data: TaskAssignmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = service.assign_user(db, current_user.id, task_id, data.assigned_user_id)
    return service.serialize_task(task)


@router.put(
    "/{task_id}/assignee",
    response_model=TaskResponse,
    summary="Replace all active assignees with a single user (owner only)",
)
def reassign_task(
    task_id: int,
    data: TaskAssignmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = service.reassign_task(db, current_user.id, task_id, data.assigned_user_id)
    return service.serialize_task(task)


@router.delete(
    "/{task_id}/assignments/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Cancel a user's assignment (owner only; row kept as history)",
)
def remove_assignment(
    task_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service.remove_assignment(db, current_user.id, task_id, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------


@router.get(
    "/{task_id}/comments",
    response_model=TaskCommentListResponse,
    summary="List a task's comments (oldest first)",
)
def list_comments(
    task_id: int,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items, total = service.list_comments(
        db, current_user.id, task_id, limit=limit, offset=offset
    )
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.post(
    "/{task_id}/comments",
    response_model=TaskCommentOut,
    status_code=status.HTTP_201_CREATED,
    summary="Add a comment (owner or active assignee)",
)
def add_comment(
    task_id: int,
    data: TaskCommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.add_comment(db, current_user.id, task_id, data.content)


@router.delete(
    "/{task_id}/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a comment (author only)",
)
def delete_comment(
    task_id: int,
    comment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service.delete_comment(db, current_user.id, task_id, comment_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Activity history
# ---------------------------------------------------------------------------


@router.get(
    "/{task_id}/activities",
    response_model=TaskActivityListResponse,
    summary="Audit trail of a task (newest first)",
)
def list_activity(
    task_id: int,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items, total = service.list_activity(
        db, current_user.id, task_id, limit=limit, offset=offset
    )
    return {"items": items, "total": total, "limit": limit, "offset": offset}


# ---------------------------------------------------------------------------
# Labels on a task
# ---------------------------------------------------------------------------


@router.put(
    "/{task_id}/labels/{label_id}",
    response_model=TaskResponse,
    summary="Attach one of the caller's labels to a task (owner only; idempotent)",
)
def attach_label(
    task_id: int,
    label_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = service.attach_label(db, current_user.id, task_id, label_id)
    return service.serialize_task(task)


@router.delete(
    "/{task_id}/labels/{label_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Detach a label from a task (owner only; idempotent)",
)
def detach_label(
    task_id: int,
    label_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service.detach_label(db, current_user.id, task_id, label_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
