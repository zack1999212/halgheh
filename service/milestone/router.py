"""FastAPI routes for workspace milestones."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from ..auth.dependencies import get_current_user
from ..auth.models import User
from ..core.database import get_db
from . import service
from .schemas import (
    MilestoneCreate,
    MilestoneListResponse,
    MilestoneReorderRequest,
    MilestoneResponse,
    MilestoneStepCreate,
    MilestoneStepReorderRequest,
    MilestoneStepUpdate,
    MilestoneUpdate,
)

router = APIRouter(prefix="/api/workspaces", tags=["milestones"])


# --- Milestones (view: workspace members; create/edit: owner only) ---


@router.post(
    "/{workspace_id}/milestones",
    response_model=MilestoneResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_milestone(
    workspace_id: int,
    data: MilestoneCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.create_milestone(db, current_user.id, workspace_id, data)


@router.get("/{workspace_id}/milestones", response_model=MilestoneListResponse)
def list_milestones(
    workspace_id: int,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items, total = service.list_milestones(
        db, current_user.id, workspace_id, limit=limit, offset=offset
    )
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.put(
    "/{workspace_id}/milestones/reorder", response_model=list[MilestoneResponse]
)
def reorder_milestones(
    workspace_id: int,
    data: MilestoneReorderRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.reorder_milestones(db, current_user.id, workspace_id, data)


@router.get(
    "/{workspace_id}/milestones/{milestone_id}", response_model=MilestoneResponse
)
def get_milestone(
    workspace_id: int,
    milestone_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.get_milestone(db, current_user.id, workspace_id, milestone_id)


@router.patch(
    "/{workspace_id}/milestones/{milestone_id}", response_model=MilestoneResponse
)
def update_milestone(
    workspace_id: int,
    milestone_id: int,
    data: MilestoneUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.update_milestone(
        db, current_user.id, workspace_id, milestone_id, data
    )


@router.delete(
    "/{workspace_id}/milestones/{milestone_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_milestone(
    workspace_id: int,
    milestone_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service.delete_milestone(db, current_user.id, workspace_id, milestone_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Steps (owner only; completion comes from the attached tasks) ---


@router.post(
    "/{workspace_id}/milestones/{milestone_id}/steps",
    response_model=MilestoneResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_milestone_step(
    workspace_id: int,
    milestone_id: int,
    data: MilestoneStepCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.create_milestone_step(
        db, current_user.id, workspace_id, milestone_id, data
    )


@router.put(
    "/{workspace_id}/milestones/{milestone_id}/steps/reorder",
    response_model=MilestoneResponse,
)
def reorder_milestone_steps(
    workspace_id: int,
    milestone_id: int,
    data: MilestoneStepReorderRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.reorder_milestone_steps(
        db, current_user.id, workspace_id, milestone_id, data
    )


@router.patch(
    "/{workspace_id}/milestones/{milestone_id}/steps/{step_id}",
    response_model=MilestoneResponse,
)
def update_milestone_step(
    workspace_id: int,
    milestone_id: int,
    step_id: int,
    data: MilestoneStepUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.update_milestone_step(
        db, current_user.id, workspace_id, milestone_id, step_id, data
    )


@router.delete(
    "/{workspace_id}/milestones/{milestone_id}/steps/{step_id}",
    response_model=MilestoneResponse,
)
def delete_milestone_step(
    workspace_id: int,
    milestone_id: int,
    step_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.delete_milestone_step(
        db, current_user.id, workspace_id, milestone_id, step_id
    )
