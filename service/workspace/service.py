from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..auth.models import User
from ..docs.models import PERSONAL_WORKSPACE, SHARED_WORKSPACE, Workspace
from ..notifications.service import add_notification
from . import permissions, repository
from . import activity as workspace_activity
from .models import WORKSPACE_INVITABLE_ROLES


def _not_found(detail: str = "Workspace not found") -> HTTPException:
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
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=conflict_detail)


def _role_for_workspace(db: Session, workspace: Workspace | None, user_id: int) -> str:
    if workspace is None:
        return permissions.ROLE_NONE
    if workspace.owner_id == user_id:
        return permissions.ROLE_OWNER
    if workspace.workspace_type == PERSONAL_WORKSPACE:
        return permissions.ROLE_NONE
    member = repository.get_member(db, workspace.id, user_id)
    return permissions.workspace_role(workspace, user_id, member.role if member else None)


def serialize_workspace(workspace: Workspace, current_user_role: str) -> dict:
    owner = getattr(workspace, "owner", None)
    return {
        "id": workspace.id,
        "name": workspace.name,
        "description": workspace.description,
        "workspace_type": workspace.workspace_type,
        "owner_id": workspace.owner_id,
        "owner": (
            {
                "id": owner.id,
                "username": getattr(owner, "username", None),
                "name": getattr(owner, "name", None),
            }
            if owner is not None
            else None
        ),
        "current_user_role": current_user_role,
        "created_at": workspace.created_at,
        "updated_at": workspace.updated_at,
    }


def ensure_personal_workspace(db: Session, user: User) -> Workspace:
    """Create the user's Personal Workspace if missing.

    Caller owns transaction boundaries when used as part of a larger flow.
    """
    existing = repository.get_personal_workspace_for_user(db, user.id)
    if existing is not None:
        return existing
    ws = repository.create_workspace(
        db,
        owner_id=user.id,
        name=f"{user.username}'s Workspace",
        description=None,
        workspace_type=PERSONAL_WORKSPACE,
    )
    return ws


def get_accessible_workspace(db: Session, workspace_id: int, actor_id: int) -> tuple[Workspace, str]:
    workspace = repository.get_workspace(db, workspace_id)
    role = _role_for_workspace(db, workspace, actor_id)
    if not permissions.can_view(role):
        raise _not_found()
    return workspace, role


def list_workspaces(
    db: Session, actor_id: int, *, limit: int = 50, offset: int = 0
) -> tuple[list[dict], int]:
    limit = min(max(limit, 1), 100)
    offset = max(offset, 0)
    rows, total = repository.list_accessible_workspaces(db, actor_id, limit=limit, offset=offset)
    result = []
    for workspace, role in rows:
        _ = workspace.owner  # hydrate for serialization
        result.append(serialize_workspace(workspace, role))
    return result, total


def get_workspace(db: Session, actor_id: int, workspace_id: int) -> dict:
    workspace, role = get_accessible_workspace(db, workspace_id, actor_id)
    _ = workspace.owner
    return serialize_workspace(workspace, role)


def create_shared_workspace(db: Session, actor_id: int, *, name: str, description: str | None = None) -> dict:
    workspace = repository.create_workspace(
        db,
        owner_id=actor_id,
        name=name,
        description=description,
        workspace_type=SHARED_WORKSPACE,
    )
    workspace_activity.record(
        db,
        workspace_ids=[workspace.id],
        actor_id=actor_id,
        event_type=workspace_activity.WORKSPACE_CREATED,
        entity_type="workspace",
        entity_id=workspace.id,
        metadata={"workspace_name": workspace.name},
    )
    _commit(db, conflict_detail="Could not create workspace")
    db.refresh(workspace)
    _ = workspace.owner
    return serialize_workspace(workspace, permissions.ROLE_OWNER)


def update_workspace(db: Session, actor_id: int, workspace_id: int, *, name: str | None = None, description=None, description_set: bool = False) -> dict:
    workspace, role = get_accessible_workspace(db, workspace_id, actor_id)
    if not permissions.can_edit_workspace(role):
        raise _forbidden("Not allowed to modify this workspace")
    if workspace.workspace_type == PERSONAL_WORKSPACE:
        # Personal workspace details are editable only by owner (role already owner).
        pass
    old_name = workspace.name
    old_description = workspace.description
    if name is not None:
        workspace.name = name
    if description_set:
        workspace.description = description
    if name is not None and name != old_name:
        workspace_activity.record(
            db,
            workspace_ids=[workspace.id],
            actor_id=actor_id,
            event_type=workspace_activity.WORKSPACE_RENAMED,
            entity_type="workspace",
            entity_id=workspace.id,
            metadata={"old_name": old_name, "new_name": workspace.name},
        )
    if description_set and description != old_description:
        workspace_activity.record(
            db,
            workspace_ids=[workspace.id],
            actor_id=actor_id,
            event_type=workspace_activity.WORKSPACE_DESCRIPTION_CHANGED,
            entity_type="workspace",
            entity_id=workspace.id,
        )

    # Keep project-backed shared workspaces in sync with their legacy project record.
    if workspace.workspace_type == SHARED_WORKSPACE:
        from sqlalchemy import select
        from ..project.models import Project

        project = db.scalar(select(Project).where(Project.workspace_id == workspace.id))
        if project is not None:
            if name is not None:
                project.name = workspace.name
            if description_set:
                project.description = workspace.description

    _commit(db, conflict_detail="Could not update workspace")
    db.refresh(workspace)
    _ = workspace.owner
    return serialize_workspace(workspace, role)


def delete_workspace(db: Session, actor_id: int, workspace_id: int) -> None:
    workspace, role = get_accessible_workspace(db, workspace_id, actor_id)
    if not permissions.can_delete_workspace(role):
        raise _forbidden("Not allowed to delete this workspace")
    if workspace.workspace_type == PERSONAL_WORKSPACE:
        raise _bad_request("Personal workspace cannot be deleted")
    # Compatibility: project-backed shared workspaces should be deleted through
    # the project lifecycle to avoid orphaning project records.
    from sqlalchemy import select
    from ..project.models import Project

    linked_project = db.scalar(select(Project.id).where(Project.workspace_id == workspace_id))
    if linked_project is not None:
        raise _bad_request("Project-backed shared workspace must be deleted through the project API")
    repository.delete_workspace(db, workspace)
    _commit(db, conflict_detail="Could not delete workspace")


def list_members(db: Session, actor_id: int, workspace_id: int) -> list[dict]:
    workspace, role = get_accessible_workspace(db, workspace_id, actor_id)
    if workspace.workspace_type == PERSONAL_WORKSPACE:
        return []
    members = repository.list_members(db, workspace.id)
    results = []
    for m in members:
        user = getattr(m, "user", None)
        results.append(
            {
                "id": m.id,
                "workspace_id": m.workspace_id,
                "user_id": m.user_id,
                "role": m.role,
                "joined_at": m.joined_at,
                "created_at": m.created_at,
                "updated_at": m.updated_at,
                "username": getattr(user, "username", None) if user else None,
                "name": getattr(user, "name", None) if user else None,
            }
        )
    return results


# --- Invitations ---

INVITATION_EXPIRATION_DAYS = 7


def _invitation_not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")


def _sync_invitation_expiration(invitation) -> None:
    if invitation.status == "pending" and invitation.expires_at <= datetime.now(timezone.utc):
        invitation.status = "expired"


def _serialize_invitation(invitation, *, invitee_username: str | None = None) -> dict:
    inv = invitation
    uname = invitee_username
    if uname is None:
        uname = getattr(inv, "invitee_username", None)
        if uname is None:
            invitee = getattr(inv, "invitee", None)
            uname = getattr(invitee, "username", None) if invitee else None
    return {
        "id": inv.id,
        "workspace_id": inv.workspace_id,
        "inviter_id": inv.inviter_id,
        "invitee_id": inv.invitee_id,
        "invitee_username": uname,
        "role": inv.role,
        "status": inv.status,
        "created_at": inv.created_at,
        "expires_at": inv.expires_at,
        "responded_at": inv.responded_at,
        "revoked_at": inv.revoked_at,
    }


def _get_linked_project(db: Session, workspace_id: int):
    from ..project.models import Project
    from sqlalchemy import select
    return db.scalar(select(Project).where(Project.workspace_id == workspace_id))


def _sync_project_invitation_from_workspace(db: Session, ws_inv, *, project_id: int):
    """Keep legacy project_invitations row in sync with canonical workspace invitation."""
    from ..project import repository as project_repository

    # Find linked legacy row
    stmt = __import__("sqlalchemy").select(project_repository.ProjectInvitation).where(
        project_repository.ProjectInvitation.workspace_invitation_id == ws_inv.id
    )
    legacy = db.scalars(stmt).first()
    if legacy is None:
        # try matching by project/invitee pending or any same id mapping not found; create
        legacy = project_repository.ProjectInvitation(
            project_id=project_id,
            inviter_id=ws_inv.inviter_id,
            invitee_id=ws_inv.invitee_id,
            workspace_invitation_id=ws_inv.id,
            invitee_username=ws_inv.invitee_username,
            role=ws_inv.role,
            status=ws_inv.status,
            expires_at=ws_inv.expires_at,
            responded_at=ws_inv.responded_at,
            revoked_at=ws_inv.revoked_at,
        )
        legacy.created_at = ws_inv.created_at
        db.add(legacy)
        db.flush()
        return legacy
    legacy.inviter_id = ws_inv.inviter_id
    legacy.invitee_id = ws_inv.invitee_id
    legacy.invitee_username = ws_inv.invitee_username
    legacy.role = ws_inv.role
    legacy.status = ws_inv.status
    legacy.expires_at = ws_inv.expires_at
    legacy.responded_at = ws_inv.responded_at
    legacy.revoked_at = ws_inv.revoked_at
    db.flush()
    return legacy


def _ensure_workspace_member_for_acceptance(db: Session, workspace: Workspace, user_id: int, role: str):
    existing = repository.get_member(db, workspace.id, user_id)
    if existing is not None:
        existing.role = role
        db.flush()
        return existing
    member = repository.create_member(
        db,
        workspace_id=workspace.id,
        user_id=user_id,
        role=role,
        joined_at=datetime.now(timezone.utc),
    )
    return member


def _sync_project_member_for_workspace_acceptance(db: Session, workspace: Workspace, user_id: int, role: str):
    project = _get_linked_project(db, workspace.id)
    if project is None:
        return None
    from ..project import repository as project_repository
    from ..project import activity as project_activity
    existing = project_repository.get_member(db, project.id, user_id)
    if existing is None:
        member = project_repository.create_member(
            db,
            project_id=project.id,
            user_id=user_id,
            role=role,
            joined_at=datetime.now(timezone.utc),
        )
        actor_user = db.get(User, user_id)
        project_activity.record(
            db,
            project_id=project.id,
            actor_id=user_id,
            event_type=project_activity.MEMBER_JOINED,
            entity_type="member",
            entity_id=member.id,
            metadata={
                "member_id": member.id,
                "user_id": user_id,
                "username": getattr(actor_user, "username", None),
                "name": getattr(actor_user, "name", None),
                "role": role,
            },
        )
        db.flush()
        return member
    existing.role = role
    db.flush()
    return existing


def create_workspace_invitation(db: Session, actor_id: int, workspace_id: int, *, username: str, role: str) -> dict:
    workspace, actor_role = get_accessible_workspace(db, workspace_id, actor_id)
    if not permissions.can_invite(actor_role):
        raise _forbidden("Not allowed to manage invitations")
    if workspace.workspace_type != SHARED_WORKSPACE:
        raise _bad_request("Personal workspaces cannot receive invitations")
    if role not in WORKSPACE_INVITABLE_ROLES:
        raise _bad_request("Invalid invitation role")

    from sqlalchemy import func, select
    invitee = db.scalar(select(User).where(func.lower(User.username) == username.strip().lower()))
    if invitee is None:
        raise _bad_request("Invited user not found")
    if invitee.id == workspace.owner_id:
        raise _bad_request("Cannot invite the workspace owner")
    if invitee.id == actor_id:
        raise _bad_request("Cannot invite yourself")
    if repository.get_member(db, workspace.id, invitee.id) is not None:
        raise _bad_request("User is already a workspace member")

    pending = repository.get_pending_invitation_for_user(db, workspace.id, invitee.id)
    if pending is not None:
        _sync_invitation_expiration(pending)
        if pending.status == "pending":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A pending invitation already exists for this user")
        db.flush()

    now = datetime.now(timezone.utc)
    inv = repository.create_invitation(
        db,
        workspace_id=workspace.id,
        inviter_id=actor_id,
        invitee_id=invitee.id,
        invitee_username=invitee.username,
        role=role,
        status="pending",
        expires_at=now + timedelta(days=INVITATION_EXPIRATION_DAYS),
        responded_at=None,
        revoked_at=None,
    )

    project = _get_linked_project(db, workspace.id)
    if project is not None:
        _sync_project_invitation_from_workspace(db, inv, project_id=project.id)

    inviter = db.get(User, actor_id)
    inviter_name = getattr(inviter, "name", None) or getattr(inviter, "username", "Someone")
    add_notification(
        db,
        user_id=invitee.id,
        type="workspace_invitation",
        title="Workspace invitation",
        message=f'{inviter_name} invited {invitee.username} to join workspace "{workspace.name}" as {role}.',
        invitation_id=inv.id,
    )

    workspace_activity.record(
        db,
        workspace_ids=[workspace.id],
        actor_id=actor_id,
        event_type=workspace_activity.MEMBER_INVITED,
        entity_type="invitation",
        entity_id=inv.id,
        metadata={
            "invitee_username": invitee.username,
            "role": role,
            "workspace_name": workspace.name,
        },
    )

    _commit(db, conflict_detail="Could not create invitation")
    db.refresh(inv)
    return _serialize_invitation(inv, invitee_username=invitee.username)


def list_workspace_invitations(db: Session, actor_id: int, workspace_id: int) -> list[dict]:
    workspace, _actor_role = get_accessible_workspace(db, workspace_id, actor_id)
    invitations = repository.list_workspace_invitations(db, workspace.id)
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
        _ = inv.invitee
        results.append(_serialize_invitation(inv))
    return results


def list_received_workspace_invitations(db: Session, actor_id: int) -> list[dict]:
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
        _ = inv.workspace
        _ = inv.inviter
        payload = _serialize_invitation(inv)
        payload["workspace_name"] = getattr(inv.workspace, "name", None)
        payload["inviter_username"] = getattr(inv.inviter, "username", None)
        payload["inviter_name"] = getattr(inv.inviter, "name", None)
        results.append(payload)
    return results


def revoke_workspace_invitation(db: Session, actor_id: int, workspace_id: int, invitation_id: int) -> dict:
    workspace, actor_role = get_accessible_workspace(db, workspace_id, actor_id)
    if not permissions.can_invite(actor_role):
        raise _forbidden("Not allowed to revoke invitations")
    inv = repository.get_invitation_for_workspace(db, workspace_id, invitation_id)
    if inv is None:
        raise _invitation_not_found()
    _sync_invitation_expiration(inv)
    if inv.status != "pending":
        raise _bad_request("Only pending invitations can be revoked")
    inv.status = "revoked"
    inv.revoked_at = datetime.now(timezone.utc)
    project = _get_linked_project(db, workspace.id)
    if project is not None:
        _sync_project_invitation_from_workspace(db, inv, project_id=project.id)
    workspace_activity.record(
        db,
        workspace_ids=[workspace.id],
        actor_id=actor_id,
        event_type=workspace_activity.INVITATION_REVOKED,
        entity_type="invitation",
        entity_id=inv.id,
        metadata={"invitee_username": inv.invitee_username},
    )
    _commit(db, conflict_detail="Could not revoke invitation")
    db.refresh(inv)
    return _serialize_invitation(inv)


def _get_received_workspace_invitation(db: Session, actor_id: int, invitation_id: int):
    inv = repository.get_invitation(db, invitation_id)
    if inv is None or inv.invitee_id != actor_id:
        raise _invitation_not_found()
    _sync_invitation_expiration(inv)
    return inv


def accept_workspace_invitation(db: Session, actor_id: int, invitation_id: int) -> dict:
    inv = _get_received_workspace_invitation(db, actor_id, invitation_id)
    if inv.status != "pending":
        if inv.status == "expired":
            db.commit()
            raise _bad_request("Invitation has expired")
        raise _bad_request("Invitation is not pending")
    if inv.expires_at <= datetime.now(timezone.utc):
        inv.status = "expired"
        db.commit()
        raise _bad_request("Invitation has expired")
    workspace = repository.get_workspace(db, inv.workspace_id)
    if workspace is None or workspace.workspace_type != SHARED_WORKSPACE:
        raise _bad_request("Workspace is not available")
    if workspace.owner_id == actor_id:
        raise _bad_request("Workspace owner cannot accept an invitation")
    if repository.get_member(db, workspace.id, actor_id) is not None:
        raise _bad_request("User is already a workspace member")

    now = datetime.now(timezone.utc)
    _ensure_workspace_member_for_acceptance(db, workspace, actor_id, inv.role)
    _sync_project_member_for_workspace_acceptance(db, workspace, actor_id, inv.role)
    inv.status = "accepted"
    inv.responded_at = now
    project = _get_linked_project(db, workspace.id)
    if project is not None:
        _sync_project_invitation_from_workspace(db, inv, project_id=project.id)

    invitee = db.get(User, actor_id)
    invitee_name = getattr(invitee, "name", None) or getattr(invitee, "username", "Someone")
    workspace_activity.record(
        db,
        workspace_ids=[workspace.id],
        actor_id=actor_id,
        event_type=workspace_activity.INVITATION_ACCEPTED,
        entity_type="invitation",
        entity_id=inv.id,
        metadata={
            "invitee_username": invitee.username,
            "role": inv.role,
            "workspace_name": workspace.name,
        },
    )
    add_notification(
        db,
        user_id=inv.inviter_id,
        type="workspace_invitation_accepted",
        title="Invitation accepted",
        message=f'{invitee_name} accepted your invitation to join workspace "{workspace.name}" as {inv.role}.',
        invitation_id=inv.id,
    )

    _commit(db, conflict_detail="Could not accept invitation")
    db.refresh(inv)
    return _serialize_invitation(inv)


def decline_workspace_invitation(db: Session, actor_id: int, invitation_id: int) -> dict:
    inv = _get_received_workspace_invitation(db, actor_id, invitation_id)
    if inv.status == "expired":
        db.commit()
        raise _bad_request("Invitation has expired")
    if inv.status != "pending":
        raise _bad_request("Invitation is not pending")
    inv.status = "declined"
    inv.responded_at = datetime.now(timezone.utc)
    project = _get_linked_project(db, inv.workspace_id)
    if project is not None:
        _sync_project_invitation_from_workspace(db, inv, project_id=project.id)
    invitee = db.get(User, actor_id)
    workspace_activity.record(
        db,
        workspace_ids=[inv.workspace_id],
        actor_id=actor_id,
        event_type=workspace_activity.INVITATION_DECLINED,
        entity_type="invitation",
        entity_id=inv.id,
        metadata={"invitee_username": getattr(invitee, "username", None)},
    )
    _commit(db, conflict_detail="Could not decline invitation")
    db.refresh(inv)
    return _serialize_invitation(inv)


# --- Membership management ---


def _serialize_member(member) -> dict:
    user = getattr(member, "user", None)
    return {
        "id": member.id,
        "workspace_id": member.workspace_id,
        "user_id": member.user_id,
        "role": member.role,
        "joined_at": member.joined_at,
        "created_at": member.created_at,
        "updated_at": member.updated_at,
        "username": getattr(user, "username", None) if user else None,
        "name": getattr(user, "name", None) if user else None,
    }


def update_workspace_member_role(
    db: Session, actor_id: int, workspace_id: int, member_id: int, new_role: str
) -> dict:
    workspace, actor_role = get_accessible_workspace(db, workspace_id, actor_id)
    if not permissions.can_manage_members(actor_role):
        raise _forbidden("Not allowed to manage members")
    if workspace.workspace_type != SHARED_WORKSPACE:
        raise _bad_request("Personal workspaces cannot have members")
    member = repository.get_member_by_id(db, workspace_id, member_id)
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    if new_role not in WORKSPACE_INVITABLE_ROLES:
        raise _bad_request("Invalid member role")
    if member.user_id == workspace.owner_id:
        raise _bad_request("Workspace owner cannot be changed through membership")
    member.role = new_role
    project = _get_linked_project(db, workspace.id)
    if project is not None:
        from ..project import repository as project_repository
        pm = project_repository.get_member(db, project.id, member.user_id)
        if pm is not None:
            pm.role = new_role
    workspace_activity.record(
        db,
        workspace_ids=[workspace.id],
        actor_id=actor_id,
        event_type=workspace_activity.MEMBER_ROLE_CHANGED,
        entity_type="member",
        entity_id=member.id,
        metadata={"user_id": member.user_id, "role": member.role},
    )
    _commit(db, conflict_detail="Could not update member role")
    db.refresh(member)
    _ = member.user
    return _serialize_member(member)


def remove_workspace_member(db: Session, actor_id: int, workspace_id: int, member_id: int) -> None:
    workspace, actor_role = get_accessible_workspace(db, workspace_id, actor_id)
    if not permissions.can_manage_members(actor_role):
        raise _forbidden("Not allowed to manage members")
    if workspace.workspace_type != SHARED_WORKSPACE:
        raise _bad_request("Personal workspaces cannot have members")
    member = repository.get_member_by_id(db, workspace_id, member_id)
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    if member.user_id == workspace.owner_id:
        raise _bad_request("Workspace owner cannot be removed")
    project = _get_linked_project(db, workspace.id)
    if project is not None:
        from ..project import repository as project_repository
        pm = project_repository.get_member(db, project.id, member.user_id)
        if pm is not None:
            project_repository.delete_member(db, pm)
    workspace_activity.record(
        db,
        workspace_ids=[workspace.id],
        actor_id=actor_id,
        event_type=workspace_activity.MEMBER_REMOVED,
        entity_type="member",
        entity_id=member.id,
        metadata={"user_id": member.user_id},
    )
    repository.delete_member(db, member)
    _commit(db, conflict_detail="Could not remove member")


def leave_workspace(db: Session, actor_id: int, workspace_id: int) -> None:
    """Let an accepted member leave a shared workspace by removing their own
    membership. Owners cannot leave their own workspace, and personal
    workspaces have no membership to leave."""
    workspace, actor_role = get_accessible_workspace(db, workspace_id, actor_id)
    if actor_role == permissions.ROLE_OWNER:
        raise _bad_request("Workspace owner cannot leave their own workspace")
    if workspace.workspace_type != SHARED_WORKSPACE:
        raise _bad_request("Personal workspaces cannot be left")
    member = repository.get_member(db, workspace.id, actor_id)
    if member is None:
        raise _bad_request("You are not a member of this workspace")

    project = _get_linked_project(db, workspace.id)
    if project is not None:
        from ..project import repository as project_repository
        pm = project_repository.get_member(db, project.id, actor_id)
        if pm is not None:
            project_repository.delete_member(db, pm)
    workspace_activity.record(
        db,
        workspace_ids=[workspace.id],
        actor_id=actor_id,
        event_type=workspace_activity.MEMBER_LEFT,
        entity_type="member",
        entity_id=member.id,
    )
    repository.delete_member(db, member)
    _commit(db, conflict_detail="Could not leave workspace")


# ---------------------------------------------------------------------------
# Resource-workspace associations (Phase 3)
# ---------------------------------------------------------------------------


RESOURCE_TYPES = ("task", "document", "event")


def _resource_not_found(resource_type: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{resource_type.capitalize()} not found")


def _load_resource(db: Session, resource_type: str, resource_id: int):
    if resource_type == "task":
        from ..task.models import Task
        return db.get(Task, resource_id)
    if resource_type == "document":
        from ..docs.models import Document
        return db.get(Document, resource_id)
    if resource_type == "event":
        from ..calendar.models import Event
        return db.get(Event, resource_id)
    raise _bad_request("Unknown resource type")


def _resource_creator_id(resource_type: str, resource) -> int | None:
    if resource is None:
        return None
    if resource_type == "task":
        return getattr(resource, "created_by", None)
    if resource_type == "document":
        return getattr(resource, "owner_id", None)
    if resource_type == "event":
        # CalendarEvent creator/ownership: calendar owner is the canonical owner context.
        cal = getattr(resource, "calendar", None)
        if cal is not None:
            return getattr(cal, "user_id", None)
        return None
    return None


def get_accessible_workspace_ids(db: Session, actor_id: int) -> list[int]:
    rows, _total = repository.list_accessible_workspaces(db, actor_id, limit=10000, offset=0)
    return [w.id for w, _role in rows]


def user_can_access_workspace(db: Session, actor_id: int, workspace_id: int) -> tuple[Workspace, str]:
    return get_accessible_workspace(db, workspace_id, actor_id)


def user_can_access_resource(db: Session, actor_id: int, resource_type: str, resource_id: int):
    """Return (resource, workspace_id, role) for any accessible associated workspace, else 404."""
    resource = _load_resource(db, resource_type, resource_id)
    if resource is None:
        raise _resource_not_found(resource_type)
    ws_ids = repository.get_resource_workspace_ids(db, resource_type, resource_id)
    for ws_id in ws_ids:
        ws = repository.get_workspace(db, ws_id)
        role = _role_for_workspace(db, ws, actor_id)
        if permissions.can_view(role):
            return resource, ws_id, role
    # No accessible associated workspace
    raise _resource_not_found(resource_type)


def ensure_workspace_resource_access(
    db: Session, actor_id: int, resource_type: str, resource_id: int, workspace_id: int
):
    workspace, role = get_accessible_workspace(db, workspace_id, actor_id)
    if not repository.has_resource_workspace(db, resource_type, resource_id, workspace_id):
        raise _resource_not_found(resource_type)
    resource = _load_resource(db, resource_type, resource_id)
    if resource is None:
        raise _resource_not_found(resource_type)
    return resource, workspace, role


def _sync_document_primary_workspace(db: Session, document, preferred_workspace_id: int | None = None) -> None:
    ws_ids = repository.get_resource_workspace_ids(db, "document", document.id)
    if not ws_ids:
        return
    if preferred_workspace_id is not None and preferred_workspace_id in ws_ids:
        document.workspace_id = preferred_workspace_id
    elif document.workspace_id not in ws_ids:
        document.workspace_id = ws_ids[0]
    db.flush()


def attach_resource_to_workspace(
    db: Session, actor_id: int, resource_type: str, resource_id: int, workspace_id: int
) -> dict:
    if resource_type not in RESOURCE_TYPES:
        raise _bad_request("Unknown resource type")
    resource = _load_resource(db, resource_type, resource_id)
    if resource is None:
        raise _resource_not_found(resource_type)

    # Must be able to access the resource through at least one workspace
    user_can_access_resource(db, actor_id, resource_type, resource_id)

    target_ws, target_role = get_accessible_workspace(db, workspace_id, actor_id)
    if target_ws.workspace_type != SHARED_WORKSPACE and target_ws.owner_id != actor_id:
        raise _forbidden("Not allowed to add resources to this workspace")
    if not permissions.can_manage_content(target_role):
        raise _forbidden("Not allowed to add resources to this workspace")
    if target_ws.workspace_type == PERSONAL_WORKSPACE and target_ws.owner_id != actor_id:
        raise _forbidden("Not allowed to add resources to this workspace")

    if repository.has_resource_workspace(db, resource_type, resource_id, workspace_id):
        return {
            "resource_type": resource_type,
            "resource_id": resource_id,
            "workspace_id": workspace_id,
            "attached": False,
        }

    # For personal workspace, only owner can attach; and do not allow attaching other user's private resource without authorization.
    creator_id = _resource_creator_id(resource_type, resource)
    if target_ws.workspace_type == SHARED_WORKSPACE:
        # User must have sufficient access to resource (checked above) and permission on target (checked above).
        pass
    if target_ws.workspace_type == PERSONAL_WORKSPACE and creator_id != actor_id and target_ws.owner_id != actor_id:
        raise _forbidden("Not allowed to attach this resource to the personal workspace")

    repository.add_resource_workspace(db, resource_type, resource_id, workspace_id)
    if resource_type == "document":
        # keep legacy primary workspace populated
        _sync_document_primary_workspace(db, resource, preferred_workspace_id=resource.workspace_id)
    _attach_event = {
        "task": workspace_activity.TASK_ATTACHED,
        "document": workspace_activity.DOCUMENT_ATTACHED,
        "event": workspace_activity.EVENT_ATTACHED,
    }[resource_type]
    workspace_activity.record(
        db,
        workspace_ids=[workspace_id],
        actor_id=actor_id,
        event_type=_attach_event,
        entity_type=resource_type,
        entity_id=resource_id,
        metadata={"resource_name": getattr(resource, "title", None) or getattr(resource, "name", None)},
    )
    _commit(db, conflict_detail="Could not attach resource to workspace")
    return {
        "resource_type": resource_type,
        "resource_id": resource_id,
        "workspace_id": workspace_id,
        "attached": True,
    }


def detach_resource_from_workspace(
    db: Session, actor_id: int, resource_type: str, resource_id: int, workspace_id: int
) -> dict:
    if resource_type not in RESOURCE_TYPES:
        raise _bad_request("Unknown resource type")
    resource, workspace, role = ensure_workspace_resource_access(db, actor_id, resource_type, resource_id, workspace_id)
    if not permissions.can_detach_resource(role):
        raise _forbidden("Not allowed to detach resources from this workspace")

    count = repository.count_resource_workspaces(db, resource_type, resource_id)
    if count <= 1:
        raise _bad_request("Cannot detach a resource from its only workspace association")

    removed = repository.remove_resource_workspace(db, resource_type, resource_id, workspace_id)
    if not removed:
        raise _resource_not_found(resource_type)

    if resource_type == "document":
        _sync_document_primary_workspace(db, resource, preferred_workspace_id=None)
    _detach_event = {
        "task": workspace_activity.TASK_DETACHED,
        "document": workspace_activity.DOCUMENT_DETACHED,
        "event": workspace_activity.EVENT_DETACHED,
    }[resource_type]
    workspace_activity.record(
        db,
        workspace_ids=[workspace_id],
        actor_id=actor_id,
        event_type=_detach_event,
        entity_type=resource_type,
        entity_id=resource_id,
        metadata={"resource_name": getattr(resource, "title", None) or getattr(resource, "name", None)},
    )
    _commit(db, conflict_detail="Could not detach resource from workspace")
    return {
        "resource_type": resource_type,
        "resource_id": resource_id,
        "workspace_id": workspace_id,
        "detached": True,
    }


def list_resource_workspaces(db: Session, actor_id: int, resource_type: str, resource_id: int) -> list[int]:
    user_can_access_resource(db, actor_id, resource_type, resource_id)
    return repository.get_resource_workspace_ids(db, resource_type, resource_id)


def can_delete_resource_everywhere(db: Session, actor_id: int, resource_type: str, resource) -> bool:
    creator_id = _resource_creator_id(resource_type, resource)
    if creator_id == actor_id:
        return True
    ws_ids = repository.get_resource_workspace_ids(db, resource_type, resource.id)
    for ws_id in ws_ids:
        ws = repository.get_workspace(db, ws_id)
        role = _role_for_workspace(db, ws, actor_id)
        if ws.workspace_type == PERSONAL_WORKSPACE and ws.owner_id == actor_id:
            return True
        if ws.workspace_type == SHARED_WORKSPACE and role == permissions.ROLE_OWNER:
            return True
    return False
