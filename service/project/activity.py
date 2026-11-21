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
    return activity
