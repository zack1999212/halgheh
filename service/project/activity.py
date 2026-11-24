"""Centralized project activity recording.

Activity records are written to the current SQLAlchemy session and rely on the
caller to commit as part of the same business transaction. This guarantees that
failed/rolled-back operations do not persist activity.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from .models import ProjectActivity

# Event type constants
TASK_CREATED = "task.created"
TASK_COMPLETED = "task.completed"
TASK_REASSIGNED = "task.reassigned"

DOCUMENT_CREATED = "document.created"
DOCUMENT_UPDATED = "document.updated"

MILESTONE_STEP_COMPLETED = "milestone_step.completed"

MEMBER_JOINED = "member.joined"

CALENDAR_EVENT_CREATED = "calendar_event.created"
CALENDAR_EVENT_UPDATED = "calendar_event.updated"

SUPPORTED_EVENT_TYPES = {
    TASK_CREATED,
    TASK_COMPLETED,
    TASK_REASSIGNED,
    DOCUMENT_CREATED,
    DOCUMENT_UPDATED,
    MILESTONE_STEP_COMPLETED,
    MEMBER_JOINED,
    CALENDAR_EVENT_CREATED,
    CALENDAR_EVENT_UPDATED,
}


def record(
    db: Session,
    *,
    project_id: int,
    actor_id: int | None,
    event_type: str,
    entity_type: str,
    entity_id: int | None = None,
    metadata: dict[str, Any] | None = None,
) -> ProjectActivity:
    """Add an immutable project activity record to the session.

    The caller owns transaction boundaries. This function does not commit.
    The same logical action is also mirrored into the workspaces that own the
    resource (or the project), so the unified workspace activity feed stays in
    sync without duplicating the recording logic at every call site.
    """
    if event_type not in SUPPORTED_EVENT_TYPES:
        raise ValueError(f"Unsupported activity event type: {event_type}")

    activity = ProjectActivity(
        project_id=project_id,
        actor_id=actor_id,
        event_type=event_type,
        entity_type=entity_type,
        entity_id=entity_id,
        metadata_=metadata or {},
    )
    db.add(activity)
    db.flush()

    _mirror_to_workspaces(
        db,
        project_id=project_id,
        actor_id=actor_id,
        event_type=event_type,
        entity_type=entity_type,
        entity_id=entity_id,
        metadata=metadata,
    )
    return activity


# Legacy project event type -> unified workspace action.
_WORKSPACE_EVENT_MAP = {
    TASK_CREATED: "task.created",
    TASK_COMPLETED: "task.completed",
    TASK_REASSIGNED: "task.assigned",
    DOCUMENT_CREATED: "document.created",
    DOCUMENT_UPDATED: "document.updated",
    MILESTONE_STEP_COMPLETED: "milestone_step.completed",
    CALENDAR_EVENT_CREATED: "event.created",
    CALENDAR_EVENT_UPDATED: "event.updated",
}
_ENTITY_RESOURCE_MAP = {
    "task": "task",
    "document": "document",
    "calendar_event": "event",
}


def _mirror_to_workspaces(
    db: Session,
    *,
    project_id: int,
    actor_id: int | None,
    event_type: str,
    entity_type: str,
    entity_id: int | None,
    metadata: dict[str, Any] | None,
) -> None:
    """Best-effort mirror into workspace-scoped activity rows."""
    from ..project.models import Project
    from ..workspace import activity as workspace_activity
    from ..workspace import repository as workspace_repository

    # MEMBER_JOINED is recorded by the workspace invitation service itself
    # (as invitation.accepted) to keep a single record per logical action.
    if event_type not in _WORKSPACE_EVENT_MAP:
        return

    workspace_ids: list[int] = []
    resource_type = _ENTITY_RESOURCE_MAP.get(entity_type)
    if resource_type and entity_id is not None:
        workspace_ids.extend(
            workspace_repository.list_resource_workspace_ids(db, resource_type, entity_id)
        )
    project = db.get(Project, project_id)
    if project is not None and project.workspace_id is not None:
        workspace_ids.append(project.workspace_id)

    if not workspace_ids:
        return
    workspace_activity.record(
        db,
        workspace_ids=workspace_ids,
        actor_id=actor_id,
        event_type=_WORKSPACE_EVENT_MAP[event_type],
        entity_type=entity_type,
        entity_id=entity_id,
        metadata=metadata or {},
        project_id=project_id,
    )
