from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from ..auth.dependencies import get_current_user
from ..auth.models import User
from ..core.database import get_db
from . import service
from .schemas import (
    ReceivedWorkspaceInvitationResponse,
    WorkspaceCreate,
    WorkspaceInvitationCreate,
    WorkspaceInvitationResponse,
    WorkspaceListResponse,
    WorkspaceMemberResponse,
    WorkspaceMemberRoleUpdate,
    WorkspaceResponse,
    WorkspaceUpdate,
)

router = APIRouter(prefix="/api/workspaces", tags=["workspaces"])
invitations_router = APIRouter(prefix="/api/workspace-invitations", tags=["workspace-invitations"])


@router.post("", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
def create_workspace(
    data: WorkspaceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.create_shared_workspace(
        db, current_user.id, name=data.name, description=data.description
    )


@router.get("", response_model=WorkspaceListResponse)
def list_workspaces(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items, total = service.list_workspaces(db, current_user.id, limit=limit, offset=offset)
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.get("/{workspace_id}", response_model=WorkspaceResponse)
def get_workspace(
    workspace_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.get_workspace(db, current_user.id, workspace_id)


@router.patch("/{workspace_id}", response_model=WorkspaceResponse)
def update_workspace(
    workspace_id: int,
    data: WorkspaceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    updates = data.model_dump(exclude_unset=True)
    return service.update_workspace(
        db,
        current_user.id,
        workspace_id,
        name=updates.get("name"),
        description=updates.get("description"),
        description_set="description" in data.model_fields_set,
    )


@router.delete("/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workspace(
    workspace_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service.delete_workspace(db, current_user.id, workspace_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{workspace_id}/members", response_model=list[WorkspaceMemberResponse])
def list_workspace_members(
    workspace_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.list_members(db, current_user.id, workspace_id)


# --- Invitations (workspace owner) ---


@router.post(
    "/{workspace_id}/invitations",
    response_model=WorkspaceInvitationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_invitation(
    workspace_id: int,
    data: WorkspaceInvitationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.create_workspace_invitation(
        db, current_user.id, workspace_id, username=data.username, role=data.role
    )


@router.get(
    "/{workspace_id}/invitations",
    response_model=list[WorkspaceInvitationResponse],
)
def list_workspace_invitations(
    workspace_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.list_workspace_invitations(db, current_user.id, workspace_id)


@router.post(
    "/{workspace_id}/invitations/{invitation_id}/revoke",
    response_model=WorkspaceInvitationResponse,
)
def revoke_invitation(
    workspace_id: int,
    invitation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.revoke_workspace_invitation(db, current_user.id, workspace_id, invitation_id)


# --- Members ---


@router.patch(
    "/{workspace_id}/members/{member_id}",
    response_model=WorkspaceMemberResponse,
)
def update_member_role(
    workspace_id: int,
    member_id: int,
    data: WorkspaceMemberRoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.update_workspace_member_role(db, current_user.id, workspace_id, member_id, data.role)


@router.delete(
    "/{workspace_id}/members/{member_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_member(
    workspace_id: int,
    member_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service.remove_workspace_member(db, current_user.id, workspace_id, member_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Received invitations ---


@invitations_router.get("", response_model=list[ReceivedWorkspaceInvitationResponse])
def list_received_invitations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.list_received_workspace_invitations(db, current_user.id)


@invitations_router.post("/{invitation_id}/accept", response_model=WorkspaceInvitationResponse)
def accept_invitation(
    invitation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.accept_workspace_invitation(db, current_user.id, invitation_id)


@invitations_router.post("/{invitation_id}/decline", response_model=WorkspaceInvitationResponse)
def decline_invitation(
    invitation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.decline_workspace_invitation(db, current_user.id, invitation_id)
