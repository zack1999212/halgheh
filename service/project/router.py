"""FastAPI routes for the project module."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from ..auth.dependencies import get_current_user
from ..auth.models import User
from ..core.database import get_db
from . import service
from .schemas import (
    ProjectActivityListResponse,
    ProjectCreate,
    ProjectInvitationCreate,
    ProjectInvitationResponse,
    ProjectListResponse,
    ProjectMemberResponse,
    ProjectMemberRoleUpdate,
    ProjectOverviewResponse,
    ProjectResponse,
    ProjectUpdate,
    ReceivedProjectInvitationResponse,
)

router = APIRouter(prefix="/api/projects", tags=["projects"])
invitations_router = APIRouter(prefix="/api/project-invitations", tags=["project-invitations"])


# --- Projects ---


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    data: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.create_project(db, current_user.id, data)


@router.get("", response_model=ProjectListResponse)
def list_projects(
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items, total = service.list_projects(
        db,
        current_user.id,
        status=status_filter,
        limit=limit,
        offset=offset,
    )
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.get_project(db, current_user.id, project_id)


@router.get("/{project_id}/overview", response_model=ProjectOverviewResponse)
def get_project_overview(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.get_project_overview(db, current_user.id, project_id)


@router.get("/{project_id}/activity", response_model=ProjectActivityListResponse)
def list_project_activity(
    project_id: int,
    event_type: list[str] = Query(default=[]),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items, total = service.list_project_activity(
        db,
        current_user.id,
        project_id,
        event_types=event_type or None,
        limit=limit,
        offset=offset,
    )
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.patch("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: int,
    data: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.update_project(db, current_user.id, project_id, data)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service.delete_project(db, current_user.id, project_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{project_id}/archive", response_model=ProjectResponse)
def archive_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.archive_project(db, current_user.id, project_id)


@router.post("/{project_id}/restore", response_model=ProjectResponse)
def restore_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.restore_project(db, current_user.id, project_id)


# --- Project invitations (owner-managed) ---


@router.post(
    "/{project_id}/invitations",
    response_model=ProjectInvitationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_invitation(
    project_id: int,
    data: ProjectInvitationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.create_invitation(db, current_user.id, project_id, data)


@router.get(
    "/{project_id}/invitations",
    response_model=list[ProjectInvitationResponse],
)
def list_project_invitations(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.list_project_invitations(db, current_user.id, project_id)


@router.post(
    "/{project_id}/invitations/{invitation_id}/revoke",
    response_model=ProjectInvitationResponse,
)
def revoke_invitation(
    project_id: int,
    invitation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.revoke_invitation(db, current_user.id, project_id, invitation_id)


# --- Members ---


@router.get(
    "/{project_id}/members",
    response_model=list[ProjectMemberResponse],
)
def list_members(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.list_members(db, current_user.id, project_id)


@router.patch(
    "/{project_id}/members/{member_id}",
    response_model=ProjectMemberResponse,
)
def update_member_role(
    project_id: int,
    member_id: int,
    data: ProjectMemberRoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.update_member_role(
        db, current_user.id, project_id, member_id, data.role
    )


@router.delete(
    "/{project_id}/members/{member_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_member(
    project_id: int,
    member_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service.remove_member(db, current_user.id, project_id, member_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Received invitations ---


@invitations_router.get("", response_model=list[ReceivedProjectInvitationResponse])
def list_received_invitations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.list_received_invitations(db, current_user.id)


@invitations_router.post(
    "/{invitation_id}/accept",
    response_model=ProjectInvitationResponse,
)
def accept_invitation(
    invitation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.accept_invitation(db, current_user.id, invitation_id)


@invitations_router.post(
    "/{invitation_id}/decline",
    response_model=ProjectInvitationResponse,
)
def decline_invitation(
    invitation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.decline_invitation(db, current_user.id, invitation_id)
