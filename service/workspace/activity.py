"""Centralized workspace activity recording and retrieval.

Extends the existing immutable project_activities table so one logical action
can be recorded in every workspace associated with a canonical resource.
Records are added to the caller's session without committing, so they share
the transaction of the operation they describe.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from ..project.models.activity import ProjectActivity
from . import repository

# Action taxonomy. Keep event types stable — the frontend maps categories and
# presentation from these values, and existing project activity uses the same
# dotted convention.
WORKSPACE_CREATED = "workspace.created"
WORKSPACE_RENAMED = "workspace.renamed"
WORKSPACE_DESCRIPTION_CHANGED = "workspace.description_changed"
MEMBER_INVITED = "member.invited"
INVITATION_ACCEPTED = "invitation.accepted"
INVITATION_DECLINED = "invitation.declined"
INVITATION_REVOKED = "invitation.revoked"
MEMBER_REMOVED = "member.removed"
MEMBER_ROLE_CHANGED = "member.role_changed"
MEMBER_LEFT = "member.left"

TASK_CREATED = "task.created"
TASK_UPDATED = "task.updated"
TASK_TITLE_CHANGED = "task.title_changed"
TASK_DESCRIPTION_CHANGED = "task.description_changed"
TASK_COMPLETED = "task.completed"
TASK_REOPENED = "task.reopened"
TASK_DELETED = "task.deleted"
TASK_ASSIGNED = "task.assigned"
TASK_UNASSIGNED = "task.unassigned"
TASK_DUE_DATE_CHANGED = "task.due_date_changed"
TASK_PRIORITY_CHANGED = "task.priority_changed"
TASK_STATUS_CHANGED = "task.status_changed"
SUBTASK_CREATED = "subtask.created"
SUBTASK_COMPLETED = "subtask.completed"
SUBTASK_REOPENED = "subtask.reopened"
SUBTASK_DELETED = "subtask.deleted"
TASK_ATTACHED = "task.attached"
TASK_DETACHED = "task.detached"

DOCUMENT_CREATED = "document.created"
DOCUMENT_RENAMED = "document.renamed"
DOCUMENT_UPDATED = "document.updated"
DOCUMENT_DELETED = "document.deleted"
DOCUMENT_RESTORED = "document.restored"
DOCUMENT_ATTACHED = "document.attached"
DOCUMENT_DETACHED = "document.detached"

EVENT_CREATED = "event.created"
EVENT_UPDATED = "event.updated"
EVENT_DELETED = "event.deleted"
EVENT_RESTORED = "event.restored"
EVENT_ATTACHED = "event.attached"
EVENT_DETACHED = "event.detached"

MILESTONE_CREATED = "milestone.created"
MILESTONE_UPDATED = "milestone.updated"
MILESTONE_COMPLETED = "milestone.completed"
MILESTONE_REOPENED = "milestone.reopened"
MILESTONE_DELETED = "milestone.deleted"
MILESTONE_STEP_CREATED = "milestone_step.created"
MILESTONE_STEP_UPDATED = "milestone_step.updated"
MILESTONE_STEP_COMPLETED = "milestone_step.completed"
MILESTONE_STEP_REOPENED = "milestone_step.reopened"
MILESTONE_STEP_DELETED = "milestone_step.deleted"

CATEGORY_WORKSPACE = "workspace"
CATEGORY_TASKS = "tasks"
CATEGORY_DOCUMENTS = "documents"
CATEGORY_CALENDAR = "calendar"
CATEGORY_MILESTONES = "milestones"
CATEGORIES = (
    CATEGORY_WORKSPACE,
    CATEGORY_TASKS,
    CATEGORY_DOCUMENTS,
    CATEGORY_CALENDAR,
    CATEGORY_MILESTONES,
)

_ACTION_CATEGORIES = {
    WORKSPACE_CREATED: CATEGORY_WORKSPACE,
    WORKSPACE_RENAMED: CATEGORY_WORKSPACE,
    WORKSPACE_DESCRIPTION_CHANGED: CATEGORY_WORKSPACE,
    MEMBER_INVITED: CATEGORY_WORKSPACE,
    INVITATION_ACCEPTED: CATEGORY_WORKSPACE,
    INVITATION_DECLINED: CATEGORY_WORKSPACE,
    INVITATION_REVOKED: CATEGORY_WORKSPACE,
    MEMBER_REMOVED: CATEGORY_WORKSPACE,
    MEMBER_ROLE_CHANGED: CATEGORY_WORKSPACE,
    MEMBER_LEFT: CATEGORY_WORKSPACE,
    TASK_CREATED: CATEGORY_TASKS,
    TASK_UPDATED: CATEGORY_TASKS,
    TASK_TITLE_CHANGED: CATEGORY_TASKS,
    TASK_DESCRIPTION_CHANGED: CATEGORY_TASKS,
    TASK_COMPLETED: CATEGORY_TASKS,
    TASK_REOPENED: CATEGORY_TASKS,
    TASK_DELETED: CATEGORY_TASKS,
    TASK_ASSIGNED: CATEGORY_TASKS,
    TASK_UNASSIGNED: CATEGORY_TASKS,
    TASK_DUE_DATE_CHANGED: CATEGORY_TASKS,
    TASK_PRIORITY_CHANGED: CATEGORY_TASKS,
    TASK_STATUS_CHANGED: CATEGORY_TASKS,
    SUBTASK_CREATED: CATEGORY_TASKS,
    SUBTASK_COMPLETED: CATEGORY_TASKS,
    SUBTASK_REOPENED: CATEGORY_TASKS,
    SUBTASK_DELETED: CATEGORY_TASKS,
    TASK_ATTACHED: CATEGORY_TASKS,
    TASK_DETACHED: CATEGORY_TASKS,
    DOCUMENT_CREATED: CATEGORY_DOCUMENTS,
    DOCUMENT_RENAMED: CATEGORY_DOCUMENTS,
    DOCUMENT_UPDATED: CATEGORY_DOCUMENTS,
    DOCUMENT_DELETED: CATEGORY_DOCUMENTS,
    DOCUMENT_RESTORED: CATEGORY_DOCUMENTS,
    DOCUMENT_ATTACHED: CATEGORY_DOCUMENTS,
    DOCUMENT_DETACHED: CATEGORY_DOCUMENTS,
    EVENT_CREATED: CATEGORY_CALENDAR,
    EVENT_UPDATED: CATEGORY_CALENDAR,
    EVENT_DELETED: CATEGORY_CALENDAR,
    EVENT_RESTORED: CATEGORY_CALENDAR,
    EVENT_ATTACHED: CATEGORY_CALENDAR,
    EVENT_DETACHED: CATEGORY_CALENDAR,
    MILESTONE_CREATED: CATEGORY_MILESTONES,
    MILESTONE_UPDATED: CATEGORY_MILESTONES,
    MILESTONE_COMPLETED: CATEGORY_MILESTONES,
    MILESTONE_REOPENED: CATEGORY_MILESTONES,
    MILESTONE_DELETED: CATEGORY_MILESTONES,
    MILESTONE_STEP_CREATED: CATEGORY_MILESTONES,
    MILESTONE_STEP_UPDATED: CATEGORY_MILESTONES,
    MILESTONE_STEP_COMPLETED: CATEGORY_MILESTONES,
    MILESTONE_STEP_REOPENED: CATEGORY_MILESTONES,
    MILESTONE_STEP_DELETED: CATEGORY_MILESTONES,
}

# Explicitly compatible with the legacy project feed vocabulary.
LEGACY_EVENT_TYPES = {
    "task.created",
    "task.completed",
    "task.reassigned",
    "document.created",
    "document.updated",
    "milestone_step.completed",
    "member.joined",
    "calendar_event.created",
    "calendar_event.updated",
}

SUPPORTED_EVENT_TYPES = frozenset(_ACTION_CATEGORIES) | LEGACY_EVENT_TYPES


def category_for(event_type: str) -> str:
    return _ACTION_CATEGORIES.get(event_type, CATEGORY_WORKSPACE)


def action_types_for_category(category: str) -> list[str]:
    return [action for action, cat in _ACTION_CATEGORIES.items() if cat == category]


def record(
    db: Session,
    *,
    workspace_ids: list[int] | set[int],
    actor_id: int | None,
    event_type: str,
    entity_type: str,
    entity_id: int | None = None,
    metadata: dict[str, Any] | None = None,
    project_id: int | None = None,
) -> list[ProjectActivity]:
    """Append one immutable record per affected workspace. No commit here."""
    if event_type not in SUPPORTED_EVENT_TYPES:
        raise ValueError(f"Unsupported activity event type: {event_type}")

    unique_ids = list(dict.fromkeys(int(wid) for wid in workspace_ids if wid is not None))
    if not unique_ids:
        return []

    created = []
    for workspace_id in unique_ids:
        row = ProjectActivity(
            workspace_id=workspace_id,
            project_id=project_id,
            actor_id=actor_id,
            event_type=event_type,
            entity_type=entity_type,
            entity_id=entity_id,
            metadata_=metadata or {},
        )
        db.add(row)
        db.flush()
        created.append(row)
    return created


def record_for_resource(
    db: Session,
    *,
    resource_type: str,
    resource_id: int,
    actor_id: int | None,
    event_type: str,
    entity_type: str | None = None,
    entity_id: int | None = None,
    metadata: dict[str, Any] | None = None,
    project_id: int | None = None,
) -> list[ProjectActivity]:
    """Resolve a canonical resource's workspaces and record in each one."""
    ids = repository.list_resource_workspace_ids(db, resource_type, resource_id)
    return record(
        db,
        workspace_ids=ids,
        actor_id=actor_id,
        event_type=event_type,
        entity_type=entity_type or resource_type,
        entity_id=resource_id if entity_id is None else entity_id,
        metadata=metadata,
        project_id=project_id,
    )


def serialize_activity(activity: ProjectActivity) -> dict:
    actor = getattr(activity, "actor", None)
    if actor is not None:
        actor_data = {
            "id": actor.id,
            "username": getattr(actor, "username", None),
            "name": getattr(actor, "name", None),
            "avatar_url": getattr(actor, "avatar_url", None),
        }
    elif activity.actor_id is not None:
        actor_data = {"id": activity.actor_id, "username": None, "name": None, "avatar_url": None}
    else:
        actor_data = None

    workspace = getattr(activity, "workspace", None)
    return {
        "id": activity.id,
        "workspace_id": activity.workspace_id,
        "workspace_name": getattr(workspace, "name", None),
        "project_id": activity.project_id,
        "actor": actor_data,
        "event_type": activity.event_type,
        "category": category_for(activity.event_type),
        "entity_type": activity.entity_type,
        "entity_id": activity.entity_id,
        "metadata": activity.metadata_ or {},
        "created_at": activity.created_at,
    }


def list_activity(
    db: Session,
    actor_id: int,
    *,
    workspace_id: int | None = None,
    category: str | None = None,
    actor_filter: int | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[dict], int]:
    """Return activity only from workspaces the actor can access."""
    if workspace_id is not None:
        from .service import get_accessible_workspace
        get_accessible_workspace(db, workspace_id, actor_id)
        workspace_ids = [workspace_id]
    else:
        workspace_ids = list(repository.list_accessible_workspace_ids(db, actor_id))

    if not workspace_ids:
        return [], 0

    stmt = select(ProjectActivity).where(ProjectActivity.workspace_id.in_(workspace_ids))
    if category:
        if category not in CATEGORIES:
            raise ValueError(f"Unknown activity category: {category}")
        types = action_types_for_category(category)
        if not types:
            return [], 0
        stmt = stmt.where(ProjectActivity.event_type.in_(types))
    if actor_filter is not None:
        stmt = stmt.where(ProjectActivity.actor_id == actor_filter)

    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    stmt = (
        stmt.options(joinedload(ProjectActivity.actor), joinedload(ProjectActivity.workspace))
        .order_by(ProjectActivity.created_at.desc(), ProjectActivity.id.desc())
        .limit(min(max(limit, 1), 100))
        .offset(max(offset, 0))
    )
    rows = list(db.scalars(stmt).all())
    return [serialize_activity(row) for row in rows], int(total or 0)
