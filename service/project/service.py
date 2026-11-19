"""Service layer for the project module.

Business rules, authorization, and transaction boundaries live here.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..notifications.service import add_notification
from . import permissions, repository
from .models import (
    COMPLETED_STATUS,
    INVITABLE_ROLES,
    INVITATION_STATUSES,
    PROJECT_STATUSES,
    Project,
    ProjectMilestone,
    ProjectMilestoneStep,
)
from .schemas import (
    MilestoneCreate,
    MilestoneReorderRequest,
    MilestoneStepCreate,
    MilestoneStepReorderRequest,
    MilestoneStepUpdate,
    MilestoneUpdate,
    ProjectCreate,
    ProjectInvitationCreate,
    ProjectUpdate,
)

INVITATION_EXPIRATION_DAYS = 7


def _not_found(detail: str = "Project not found") -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


def _forbidden(detail: str = "Not allowed to perform this action") -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


def _bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def _commit(db: Session, *, conflict_detail: str = "Conflict") -> None:
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=conflict_detail
        )


def _validate_dates(start_date, target_date) -> None:
    if start_date and target_date and target_date < start_date:
        raise _bad_request("target_date must not be earlier than start_date")


def _user_role_for_project(db: Session, project: Project | None, actor_id: int) -> str:
    if project is None:
        return permissions.ROLE_NONE
    if project.owner_id == actor_id:
        return permissions.ROLE_OWNER
    member = repository.get_member(db, project.id, actor_id)
    return permissions.project_role(project, actor_id, member.role if member else None)


def _get_accessible_project(db: Session, project_id: int, actor_id: int) -> tuple[Project, str]:
    project = repository.get_project(db, project_id)
    role = _user_role_for_project(db, project, actor_id)
    if not permissions.can_view(role):
        raise _not_found()
    return project, role


def serialize_project(project: Project, current_user_role: str) -> dict:
    return {
        "id": project.id,
        "owner_id": project.owner_id,
        "name": project.name,
        "description": project.description,
        "status": project.status,
        "start_date": project.start_date,
        "target_date": project.target_date,
        "color": project.color,
        "icon": project.icon,
        "archived_at": project.archived_at,
        "created_at": project.created_at,
        "updated_at": project.updated_at,
        "current_user_role": current_user_role,
    }


# --- Projects ---


def create_project(db: Session, actor_id: int, data: ProjectCreate) -> dict:
    _validate_dates(data.start_date, data.target_date)
    project = repository.create_project(
        db,
        owner_id=actor_id,
        name=data.name,
        description=data.description,
        status="active",
        start_date=data.start_date,
        target_date=data.target_date,
        color=data.color,
        icon=data.icon,
        archived_at=None,
    )
    _commit(db, conflict_detail="Could not create project")
    db.refresh(project)
    return serialize_project(project, permissions.ROLE_OWNER)


def get_project(db: Session, actor_id: int, project_id: int) -> dict:
    project, role = _get_accessible_project(db, project_id, actor_id)
    return serialize_project(project, role)


def list_projects(
    db: Session,
    actor_id: int,
    *,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[dict], int]:
    if status is not None and status not in PROJECT_STATUSES:
        raise _bad_request(f"Unknown project status: {status}")
    limit = min(max(limit, 1), 100)
    offset = max(offset, 0)
    items, total = repository.list_projects_for_user(
        db, actor_id, status=status, limit=limit, offset=offset
    )
    return [serialize_project(project, role) for project, role in items], total


def _apply_archival_consistency(project: Project, new_status: str) -> None:
    if new_status == "archived":
        project.status = "archived"
        if project.archived_at is None:
            project.archived_at = datetime.now(timezone.utc)
    else:
        project.status = new_status
        project.archived_at = None


def update_project(
    db: Session, actor_id: int, project_id: int, data: ProjectUpdate
) -> dict:
    project, role = _get_accessible_project(db, project_id, actor_id)
    if not permissions.can_edit_project_settings(role):
        raise _forbidden("Not allowed to modify project settings")

    updates = data.model_dump(exclude_unset=True)

    if "start_date" in updates or "target_date" in updates:
        merged_start = updates.get("start_date", project.start_date)
        merged_target = updates.get("target_date", project.target_date)
        _validate_dates(merged_start, merged_target)

    for field, value in updates.items():
        if field == "status":
            continue
        setattr(project, field, value)

    if "status" in updates and updates["status"] is not None:
        _apply_archival_consistency(project, updates["status"])

    _validate_dates(project.start_date, project.target_date)

    _commit(db, conflict_detail="Could not update project")
    db.refresh(project)
    return serialize_project(project, role)


def archive_project(db: Session, actor_id: int, project_id: int) -> dict:
    project, role = _get_accessible_project(db, project_id, actor_id)
    if not permissions.can_archive_or_delete(role):
        raise _forbidden("Not allowed to archive this project")
    project.status = "archived"
    if project.archived_at is None:
        project.archived_at = datetime.now(timezone.utc)
    _commit(db, conflict_detail="Could not archive project")
    db.refresh(project)
    return serialize_project(project, role)


def restore_project(db: Session, actor_id: int, project_id: int) -> dict:
    project, role = _get_accessible_project(db, project_id, actor_id)
    if not permissions.can_archive_or_delete(role):
        raise _forbidden("Not allowed to restore this project")
    if project.status == "archived":
        project.status = "active"
        project.archived_at = None
        _commit(db, conflict_detail="Could not restore project")
        db.refresh(project)
    return serialize_project(project, role)


def delete_project(db: Session, actor_id: int, project_id: int) -> None:
    project, role = _get_accessible_project(db, project_id, actor_id)
    if not permissions.can_archive_or_delete(role):
        raise _forbidden("Not allowed to delete this project")
    repository.delete_project(db, project)
    _commit(db, conflict_detail="Could not delete project")


# --- Invitations ---


def _sync_invitation_expiration(invitation) -> None:
    if invitation.status == "pending" and invitation.expires_at <= datetime.now(timezone.utc):
        invitation.status = "expired"


def _invitation_not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")


def _member_not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")


def create_invitation(
    db: Session, actor_id: int, project_id: int, data: ProjectInvitationCreate
):
    project, role = _get_accessible_project(db, project_id, actor_id)
    if not permissions.can_manage_invitations(role):
        raise _forbidden("Not allowed to manage invitations")

    invitee = repository.find_user_by_username(db, data.username)
    if invitee is None:
        raise _bad_request("Invited user not found")

    if invitee.id == project.owner_id:
        raise _bad_request("Cannot invite the project owner")

    if repository.get_member(db, project.id, invitee.id) is not None:
        raise _bad_request("User is already a project member")

    pending = repository.get_pending_invitation_for_user(db, project.id, invitee.id)
    if pending is not None:
        _sync_invitation_expiration(pending)
        if pending.status == "pending":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A pending invitation already exists for this user",
            )
        # Expired pending invitation: mark expired and allow a new one.
        db.flush()

    inviter = repository.get_user(db, actor_id)
    now = datetime.now(timezone.utc)
    invitation = repository.create_invitation(
        db,
        project_id=project.id,
        inviter_id=actor_id,
        invitee_id=invitee.id,
        invitee_username=invitee.username,
        role=data.role,
        status="pending",
        expires_at=now + timedelta(days=INVITATION_EXPIRATION_DAYS),
        responded_at=None,
        revoked_at=None,
    )

    inviter_name = getattr(inviter, "name", None) or getattr(inviter, "username", "Someone")
    project_name = project.name
    add_notification(
        db,
        user_id=invitee.id,
        type="project_invitation",
        title="Project invitation",
        message=(
            f'{inviter_name} invited {invitee.username} to join project '
            f'"{project_name}" as {data.role}.'
        ),
    )

    _commit(db, conflict_detail="Could not create invitation")
    db.refresh(invitation)
    return invitation


def list_project_invitations(db: Session, actor_id: int, project_id: int):
    project, role = _get_accessible_project(db, project_id, actor_id)
    if not permissions.can_manage_invitations(role):
        raise _forbidden("Not allowed to view project invitations")
    invitations = repository.list_project_invitations(db, project.id)
    changed = False
    for inv in invitations:
        before = inv.status
        _sync_invitation_expiration(inv)
        if inv.status != before:
            changed = True
    if changed:
        db.commit()
        for inv in invitations:
            db.refresh(inv)
    return invitations


def revoke_invitation(db: Session, actor_id: int, project_id: int, invitation_id: int):
    project, role = _get_accessible_project(db, project_id, actor_id)
    if not permissions.can_manage_invitations(role):
        raise _forbidden("Not allowed to revoke invitations")
    invitation = repository.get_invitation_for_project(db, project_id, invitation_id)
    if invitation is None:
        raise _invitation_not_found()
    _sync_invitation_expiration(invitation)
    if invitation.status != "pending":
        raise _bad_request("Only pending invitations can be revoked")
    invitation.status = "revoked"
    invitation.revoked_at = datetime.now(timezone.utc)
    _commit(db, conflict_detail="Could not revoke invitation")
    db.refresh(invitation)
    return invitation


def list_received_invitations(db: Session, actor_id: int):
    invitations = repository.list_received_invitations(db, actor_id)
    changed = False
    for inv in invitations:
        before = inv.status
        _sync_invitation_expiration(inv)
        if inv.status != before:
            changed = True
    if changed:
        db.commit()
        for inv in invitations:
            db.refresh(inv)

    results = []
    for inv in invitations:
        project = repository.get_project(db, inv.project_id)
        inviter = repository.get_user(db, inv.inviter_id)
        results.append(
            {
                "id": inv.id,
                "project_id": inv.project_id,
                "inviter_id": inv.inviter_id,
                "invitee_id": inv.invitee_id,
                "invitee_username": inv.invitee_username,
                "role": inv.role,
                "status": inv.status,
                "created_at": inv.created_at,
                "expires_at": inv.expires_at,
                "responded_at": inv.responded_at,
                "revoked_at": inv.revoked_at,
                "project_name": project.name if project else None,
                "inviter_username": getattr(inviter, "username", None) if inviter else None,
                "inviter_name": getattr(inviter, "name", None) if inviter else None,
            }
        )
    return results


def _get_received_invitation(db: Session, actor_id: int, invitation_id: int):
    invitation = repository.get_invitation(db, invitation_id)
    if invitation is None or invitation.invitee_id != actor_id:
        raise _invitation_not_found()
    _sync_invitation_expiration(invitation)
    return invitation


def accept_invitation(db: Session, actor_id: int, invitation_id: int):
    invitation = _get_received_invitation(db, actor_id, invitation_id)
    if invitation.status != "pending":
        if invitation.status == "expired":
            db.commit()
            raise _bad_request("Invitation has expired")
        raise _bad_request("Invitation is not pending")
    if invitation.expires_at <= datetime.now(timezone.utc):
        invitation.status = "expired"
        db.commit()
        raise _bad_request("Invitation has expired")
    if repository.get_member(db, invitation.project_id, actor_id) is not None:
        raise _bad_request("User is already a project member")

    now = datetime.now(timezone.utc)
    repository.create_member(
        db,
        project_id=invitation.project_id,
        user_id=actor_id,
        role=invitation.role,
        joined_at=now,
    )
    invitation.status = "accepted"
    invitation.responded_at = now
    _commit(db, conflict_detail="Could not accept invitation")
    db.refresh(invitation)
    return invitation


def decline_invitation(db: Session, actor_id: int, invitation_id: int):
    invitation = _get_received_invitation(db, actor_id, invitation_id)
    if invitation.status == "expired":
        db.commit()
        raise _bad_request("Invitation has expired")
    if invitation.status != "pending":
        raise _bad_request("Invitation is not pending")
    invitation.status = "declined"
    invitation.responded_at = datetime.now(timezone.utc)
    _commit(db, conflict_detail="Could not decline invitation")
    db.refresh(invitation)
    return invitation


# --- Members ---


def _serialize_member(member) -> dict:
    user = getattr(member, "user", None)
    return {
        "id": member.id,
        "project_id": member.project_id,
        "user_id": member.user_id,
        "role": member.role,
        "joined_at": member.joined_at,
        "created_at": member.created_at,
        "updated_at": member.updated_at,
        "username": getattr(user, "username", None) if user else None,
        "name": getattr(user, "name", None) if user else None,
    }


def list_members(db: Session, actor_id: int, project_id: int):
    project, role = _get_accessible_project(db, project_id, actor_id)
    # Any user who can view the project may list members; mutations remain owner-only.
    if not permissions.can_view(role):
        raise _not_found()
    members = repository.list_members(db, project.id)
    # Eagerly ensure user info is available for serialization.
    results = []
    for m in members:
        _ = m.user  # may trigger lazy load
        results.append(_serialize_member(m))
    return results


def update_member_role(
    db: Session, actor_id: int, project_id: int, member_id: int, new_role: str
):
    project, role = _get_accessible_project(db, project_id, actor_id)
    if not permissions.can_manage_members(role):
        raise _forbidden("Not allowed to manage members")
    member = repository.get_member_by_id(db, project_id, member_id)
    if member is None:
        raise _member_not_found()
    if new_role not in permissions.MANAGEABLE_MEMBER_ROLES:
        raise _bad_request("Invalid member role")
    member.role = new_role
    _commit(db, conflict_detail="Could not update member role")
    db.refresh(member)
    _ = member.user
    return _serialize_member(member)


def remove_member(db: Session, actor_id: int, project_id: int, member_id: int) -> None:
    project, role = _get_accessible_project(db, project_id, actor_id)
    if not permissions.can_manage_members(role):
        raise _forbidden("Not allowed to manage members")
    member = repository.get_member_by_id(db, project_id, member_id)
    if member is None:
        raise _member_not_found()
    # Owner has no member record; explicit check for safety.
    if member.user_id == project.owner_id:
        raise _bad_request("Project owner cannot be removed")
    repository.delete_member(db, member)
    _commit(db, conflict_detail="Could not remove member")


# --- Milestones ---


def _milestone_not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND, detail="Milestone not found"
    )


def _step_not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND, detail="Milestone step not found"
    )


def _get_project_milestone(
    db: Session, project_id: int, milestone_id: int
) -> ProjectMilestone:
    milestone = repository.get_milestone_for_project(db, project_id, milestone_id)
    if milestone is None:
        raise _milestone_not_found()
    return milestone


def _milestone_progress_state(milestone: ProjectMilestone) -> tuple[int, int, float, str]:
    steps = list(getattr(milestone, "steps", []) or [])
    total = len(steps)
    completed = sum(1 for s in steps if s.is_completed)
    progress = 0.0 if total == 0 else round((completed / total) * 100, 2)
    if total == 0:
        derived_status = "pending"
    elif completed == total:
        derived_status = "completed"
    elif completed == 0:
        derived_status = "pending"
    else:
        derived_status = "in_progress"
    return completed, total, progress, derived_status


def _sync_milestone_progress(milestone: ProjectMilestone) -> None:
    """Derive and persist milestone progress/status from its steps."""
    _completed, total, _progress, derived_status = _milestone_progress_state(milestone)
    if derived_status == "completed" and total > 0:
        if milestone.status != "completed" or milestone.completed_at is None:
            milestone.completed_at = datetime.now(timezone.utc)
        milestone.status = "completed"
    else:
        milestone.status = derived_status
        milestone.completed_at = None


def _serialize_step(step: ProjectMilestoneStep) -> dict:
    return {
        "id": step.id,
        "milestone_id": step.milestone_id,
        "title": step.title,
        "description": step.description,
        "position": step.position,
        "is_completed": step.is_completed,
        "completed_at": step.completed_at,
        "created_at": step.created_at,
        "updated_at": step.updated_at,
    }


def _serialize_milestone(milestone: ProjectMilestone) -> dict:
    steps = sorted(list(getattr(milestone, "steps", []) or []), key=lambda s: (s.position, s.id))
    completed_steps, total_steps, progress, _derived = _milestone_progress_state(milestone)
    return {
        "id": milestone.id,
        "project_id": milestone.project_id,
        "title": milestone.title,
        "description": milestone.description,
        "status": milestone.status,
        "position": milestone.position,
        "due_date": milestone.due_date,
        "completed_at": milestone.completed_at,
        "created_by": milestone.created_by,
        "created_at": milestone.created_at,
        "updated_at": milestone.updated_at,
        "progress": progress,
        "completed_steps": completed_steps,
        "total_steps": total_steps,
        "steps": [_serialize_step(s) for s in steps],
    }


def _apply_step_positions(steps: list[ProjectMilestoneStep]) -> None:
    for idx, step in enumerate(sorted(steps, key=lambda s: (s.position, s.id))):
        step.position = idx


def _apply_milestone_positions(milestones: list[ProjectMilestone]) -> None:
    for idx, milestone in enumerate(
        sorted(milestones, key=lambda m: (m.position, m.due_date or date.max, m.created_at, m.id))
    ):
        milestone.position = idx


def create_milestone(
    db: Session, actor_id: int, project_id: int, data: MilestoneCreate
) -> dict:
    project, _role = require_project_manage(db, actor_id, project_id)
    position = (
        data.position
        if data.position is not None
        else repository.get_next_milestone_position(db, project.id)
    )
    milestone = repository.create_milestone(
        db,
        project_id=project.id,
        title=data.title,
        description=data.description,
        status="pending",
        position=position,
        due_date=data.due_date,
        completed_at=None,
        created_by=actor_id,
    )
    db.flush()

    initial_steps = data.steps or []
    for idx, step_data in enumerate(initial_steps):
        step_position = step_data.position if step_data.position is not None else idx
        repository.create_step(
            db,
            milestone_id=milestone.id,
            title=step_data.title,
            description=step_data.description,
            position=step_position,
            is_completed=False,
            completed_at=None,
        )
    db.flush()
    # Normalize positions and derive status/progress.
    db.expire(milestone, ["steps"])
    if initial_steps:
        _apply_step_positions(list(milestone.steps))
    _sync_milestone_progress(milestone)
    _commit(db, conflict_detail="Could not create milestone")
    db.refresh(milestone)
    db.expire(milestone, ["steps"])
    return _serialize_milestone(milestone)


def list_milestones(
    db: Session,
    actor_id: int,
    project_id: int,
    *,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[dict], int]:
    project, _role = require_project_view(db, actor_id, project_id)
    limit = min(max(limit, 1), 100)
    offset = max(offset, 0)
    items, total = repository.list_milestones(db, project.id, limit=limit, offset=offset)
    # Keep stored status/progress consistent with steps (defensive sync).
    changed = False
    for m in items:
        before_status = m.status
        before_completed = m.completed_at
        _sync_milestone_progress(m)
        if m.status != before_status or m.completed_at != before_completed:
            changed = True
    if changed:
        db.commit()
        for m in items:
            db.refresh(m)
            _ = list(m.steps)
    return [_serialize_milestone(m) for m in items], total


def get_milestone(
    db: Session, actor_id: int, project_id: int, milestone_id: int
) -> dict:
    project, _role = require_project_view(db, actor_id, project_id)
    milestone = _get_project_milestone(db, project.id, milestone_id)
    _ = list(milestone.steps)
    before_status = milestone.status
    before_completed = milestone.completed_at
    _sync_milestone_progress(milestone)
    if milestone.status != before_status or milestone.completed_at != before_completed:
        db.commit()
        db.refresh(milestone)
        _ = list(milestone.steps)
    return _serialize_milestone(milestone)


def update_milestone(
    db: Session,
    actor_id: int,
    project_id: int,
    milestone_id: int,
    data: MilestoneUpdate,
) -> dict:
    project, _role = require_project_manage(db, actor_id, project_id)
    milestone = _get_project_milestone(db, project.id, milestone_id)

    updates = data.model_dump(exclude_unset=True)
    # Status/progress are derived from steps; only editable fields are applied.
    for field in ("title", "description", "due_date", "position"):
        if field in updates:
            setattr(milestone, field, updates[field])

    _ = list(milestone.steps)
    _sync_milestone_progress(milestone)
    _commit(db, conflict_detail="Could not update milestone")
    db.refresh(milestone)
    _ = list(milestone.steps)
    return _serialize_milestone(milestone)


def delete_milestone(
    db: Session, actor_id: int, project_id: int, milestone_id: int
) -> None:
    project, _role = require_project_manage(db, actor_id, project_id)
    milestone = _get_project_milestone(db, project.id, milestone_id)
    repository.delete_milestone(db, milestone)
    _commit(db, conflict_detail="Could not delete milestone")


def reorder_milestones(
    db: Session, actor_id: int, project_id: int, data: MilestoneReorderRequest
) -> list[dict]:
    project, _role = require_project_manage(db, actor_id, project_id)
    milestones = repository.list_all_milestones_for_project(db, project.id)
    by_id = {m.id: m for m in milestones}
    requested_ids = [item.id for item in data.items]
    if len(set(requested_ids)) != len(requested_ids):
        raise _bad_request("Duplicate milestone IDs in reorder request")
    if set(requested_ids) != set(by_id.keys()):
        raise _bad_request("Reorder request must include all project milestones")

    for item in data.items:
        milestone = by_id.get(item.id)
        if milestone is None or milestone.project_id != project.id:
            raise _milestone_not_found()
        milestone.position = item.position
    # Normalize to stable contiguous ordering while respecting requested positions.
    _apply_milestone_positions(milestones)
    for m in milestones:
        _sync_milestone_progress(m)
    _commit(db, conflict_detail="Could not reorder milestones")
    milestones = repository.list_all_milestones_for_project(db, project.id)
    return [_serialize_milestone(m) for m in milestones]


# --- Milestone steps ---


def _get_project_milestone_step(
    db: Session, project_id: int, milestone_id: int, step_id: int
) -> tuple[ProjectMilestone, ProjectMilestoneStep]:
    milestone = _get_project_milestone(db, project_id, milestone_id)
    step = repository.get_step_for_milestone(db, milestone.id, step_id)
    if step is None:
        raise _step_not_found()
    if step.milestone_id != milestone.id or milestone.project_id != project_id:
        raise _step_not_found()
    return milestone, step


def create_milestone_step(
    db: Session, actor_id: int, project_id: int, milestone_id: int, data: MilestoneStepCreate
) -> dict:
    project, _role = require_project_manage(db, actor_id, project_id)
    milestone = _get_project_milestone(db, project.id, milestone_id)
    position = (
        data.position
        if data.position is not None
        else repository.get_next_step_position(db, milestone.id)
    )
    repository.create_step(
        db,
        milestone_id=milestone.id,
        title=data.title,
        description=data.description,
        position=position,
        is_completed=False,
        completed_at=None,
    )
    db.flush()
    # Reload steps (including newly created) to normalize and sync milestone.
    db.expire(milestone, ["steps"])
    _apply_step_positions(list(milestone.steps))
    _sync_milestone_progress(milestone)
    _commit(db, conflict_detail="Could not create milestone step")
    db.refresh(milestone)
    db.expire(milestone, ["steps"])
    return _serialize_milestone(milestone)


def update_milestone_step(
    db: Session,
    actor_id: int,
    project_id: int,
    milestone_id: int,
    step_id: int,
    data: MilestoneStepUpdate,
) -> dict:
    project, _role = require_project_manage(db, actor_id, project_id)
    milestone, step = _get_project_milestone_step(db, project.id, milestone_id, step_id)
    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(step, field, value)
    db.expire(milestone, ["steps"])
    _sync_milestone_progress(milestone)
    _commit(db, conflict_detail="Could not update milestone step")
    db.refresh(milestone)
    db.expire(milestone, ["steps"])
    return _serialize_milestone(milestone)


def delete_milestone_step(
    db: Session, actor_id: int, project_id: int, milestone_id: int, step_id: int
) -> dict:
    project, _role = require_project_manage(db, actor_id, project_id)
    milestone, step = _get_project_milestone_step(db, project.id, milestone_id, step_id)
    repository.delete_step(db, step)
    db.flush()
    db.expire(milestone, ["steps"])
    _apply_step_positions(list(milestone.steps))
    _sync_milestone_progress(milestone)
    _commit(db, conflict_detail="Could not delete milestone step")
    db.refresh(milestone)
    db.expire(milestone, ["steps"])
    return _serialize_milestone(milestone)


def complete_milestone_step(
    db: Session, actor_id: int, project_id: int, milestone_id: int, step_id: int
) -> dict:
    project, _role = require_project_manage(db, actor_id, project_id)
    milestone, step = _get_project_milestone_step(db, project.id, milestone_id, step_id)
    if not step.is_completed:
        step.is_completed = True
        step.completed_at = datetime.now(timezone.utc)
    elif step.completed_at is None:
        step.completed_at = datetime.now(timezone.utc)
    db.expire(milestone, ["steps"])
    _sync_milestone_progress(milestone)
    _commit(db, conflict_detail="Could not complete milestone step")
    db.refresh(milestone)
    db.expire(milestone, ["steps"])
    return _serialize_milestone(milestone)


def reopen_milestone_step(
    db: Session, actor_id: int, project_id: int, milestone_id: int, step_id: int
) -> dict:
    project, _role = require_project_manage(db, actor_id, project_id)
    milestone, step = _get_project_milestone_step(db, project.id, milestone_id, step_id)
    step.is_completed = False
    step.completed_at = None
    db.expire(milestone, ["steps"])
    _sync_milestone_progress(milestone)
    _commit(db, conflict_detail="Could not reopen milestone step")
    db.refresh(milestone)
    db.expire(milestone, ["steps"])
    return _serialize_milestone(milestone)


def reorder_milestone_steps(
    db: Session,
    actor_id: int,
    project_id: int,
    milestone_id: int,
    data: MilestoneStepReorderRequest,
) -> dict:
    project, _role = require_project_manage(db, actor_id, project_id)
    milestone = _get_project_milestone(db, project.id, milestone_id)
    db.expire(milestone, ["steps"])
    steps = list(milestone.steps)
    by_id = {s.id: s for s in steps}
    requested_ids = [item.id for item in data.items]
    if len(set(requested_ids)) != len(requested_ids):
        raise _bad_request("Duplicate step IDs in reorder request")
    if set(requested_ids) != set(by_id.keys()):
        raise _bad_request("Reorder request must include all milestone steps")

    for item in data.items:
        step = by_id.get(item.id)
        if step is None or step.milestone_id != milestone.id:
            raise _step_not_found()
        step.position = item.position
    _apply_step_positions(steps)
    _sync_milestone_progress(milestone)
    _commit(db, conflict_detail="Could not reorder milestone steps")
    db.refresh(milestone)
    db.expire(milestone, ["steps"])
    return _serialize_milestone(milestone)


# --- Project access helpers for other modules ---


def get_project_role(db: Session, actor_id: int, project_id: int) -> str:
    project = repository.get_project(db, project_id)
    if project is None:
        return permissions.ROLE_NONE
    if project.owner_id == actor_id:
        return permissions.ROLE_OWNER
    member = repository.get_member(db, project.id, actor_id)
    return permissions.project_role(project, actor_id, member.role if member else None)


def require_project_view(db: Session, actor_id: int, project_id: int) -> tuple:
    project = repository.get_project(db, project_id)
    role = get_project_role(db, actor_id, project_id)
    if project is None or not permissions.can_view(role):
        raise _not_found()
    return project, role


def require_project_manage(db: Session, actor_id: int, project_id: int) -> tuple:
    project, role = require_project_view(db, actor_id, project_id)
    if not permissions.can_manage_project_content(role):
        raise _forbidden("Not allowed to manage project content")
    return project, role


# --- Project overview ---


def _task_progress_metrics(counts_by_status: dict[str, int]) -> dict:
    total = sum(counts_by_status.values())
    completed = counts_by_status.get("done", 0)
    in_progress = counts_by_status.get("in_progress", 0)
    pending = counts_by_status.get("todo", 0)
    known = {"done", "in_progress", "todo"}
    other = sum(count for status, count in counts_by_status.items() if status not in known)
    # Defensive completeness: every eligible task must be represented.
    accounted = completed + in_progress + pending + other
    if accounted != total:
        other += total - accounted
    percentage = 0.0 if total == 0 else round((completed / total) * 100, 2)
    return {
        "percentage": percentage,
        "tasks": {
            "total": total,
            "completed": completed,
            "in_progress": in_progress,
            "pending": pending,
            "other": other,
        },
    }


def _serialize_upcoming_milestone(milestone: ProjectMilestone) -> dict:
    steps = sorted(list(getattr(milestone, "steps", []) or []), key=lambda s: (s.position, s.id))
    completed_steps, total_steps, progress, _ = _milestone_progress_state(milestone)
    next_step = next((s.title for s in steps if not s.is_completed), None)
    return {
        "id": milestone.id,
        "title": milestone.title,
        "status": milestone.status,
        "due_date": milestone.due_date,
        "progress": progress,
        "completed_steps": completed_steps,
        "total_steps": total_steps,
        "next_incomplete_step": next_step,
    }


def _milestone_metrics(counts_by_status: dict[str, int], upcoming) -> dict:
    pending = counts_by_status.get("pending", 0)
    in_progress = counts_by_status.get("in_progress", 0)
    completed = counts_by_status.get("completed", 0)
    cancelled = counts_by_status.get("cancelled", 0)
    total = pending + in_progress + completed + cancelled
    grouped_total = sum(counts_by_status.values())
    if grouped_total != total:
        total = grouped_total
    return {
        "total": total,
        "pending": pending,
        "in_progress": in_progress,
        "completed": completed,
        "cancelled": cancelled,
        "upcoming": [_serialize_upcoming_milestone(m) for m in upcoming],
    }


def _membership_metrics(counts_by_role: dict[str, int]) -> dict:
    owner = 1
    admin = counts_by_role.get("admin", 0)
    editor = counts_by_role.get("editor", 0)
    viewer = counts_by_role.get("viewer", 0)
    # Only accepted ProjectMember rows exist; pending/removed are not stored here.
    total_members = owner + admin + editor + viewer
    return {
        "total_members": total_members,
        "owner": owner,
        "admin": admin,
        "editor": editor,
        "viewer": viewer,
    }


def _upcoming_project_events(db: Session, actor_id: int, project_id: int):
    # Lazy import to avoid circular dependency with calendar.service, which
    # depends on project.service/permissions.
    from ..calendar import service as calendar_service

    now = datetime.now(timezone.utc)
    window_end = now + timedelta(days=180)
    occurrences = calendar_service.list_project_occurrences(
        db,
        project_id,
        actor_id,
        now,
        window_end,
        "UTC",
    )
    return occurrences[:5]


def get_project_overview(db: Session, actor_id: int, project_id: int) -> dict:
    project, role = _get_accessible_project(db, project_id, actor_id)

    task_counts = repository.count_tasks_by_status(db, project.id)
    milestone_counts = repository.count_milestones_by_status(db, project.id)
    member_counts = repository.count_members_by_role(db, project.id)

    today = date.today()
    upcoming_milestones = repository.list_upcoming_milestones(
        db, project.id, as_of=today, limit=5
    )
    # Keep upcoming milestone derived state consistent before serializing.
    changed = False
    for m in upcoming_milestones:
        before_status = m.status
        before_completed = m.completed_at
        _sync_milestone_progress(m)
        if m.status != before_status or m.completed_at != before_completed:
            changed = True
    if changed:
        db.commit()
        for m in upcoming_milestones:
            db.refresh(m)
            _ = list(m.steps)

    upcoming_events = _upcoming_project_events(db, actor_id, project.id)

    progress = _task_progress_metrics(task_counts)

    return {
        "project": {
            "id": project.id,
            "owner_id": project.owner_id,
            "name": project.name,
            "description": project.description,
            "status": project.status,
            "start_date": project.start_date,
            "target_date": project.target_date,
            "color": project.color,
            "icon": project.icon,
            "archived_at": project.archived_at,
            "created_at": project.created_at,
            "updated_at": project.updated_at,
        },
        "current_user_role": role,
        "progress": progress,
        "milestones": _milestone_metrics(milestone_counts, upcoming_milestones),
        "members": _membership_metrics(member_counts),
        "upcoming_events": upcoming_events,
    }
