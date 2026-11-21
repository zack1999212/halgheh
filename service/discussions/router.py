from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from ..auth.dependencies import get_current_user
from ..auth.models import User
from ..core.database import get_db
from . import service
from .schemas import (
    DiscussionCreate,
    DiscussionListResponse,
    DiscussionPinUpdate,
    DiscussionResponse,
    DiscussionUpdate,
    ReactionMutationResponse,
    ReactionRequest,
    ReplyCreate,
    ReplyListResponse,
    ReplyResponse,
    ReplyUpdate,
)

router = APIRouter(prefix="/api/projects/{project_id}/discussions", tags=["project-discussions"])


@router.get("", response_model=DiscussionListResponse)
def list_discussions(
    project_id: int,
    type: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items, total = service.list_discussions(
        db,
        project_id,
        current_user.id,
        discussion_type=type,
        limit=limit,
        offset=offset,
    )
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.post("", response_model=DiscussionResponse, status_code=status.HTTP_201_CREATED)
def create_discussion(
    project_id: int,
    data: DiscussionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.create_discussion(db, project_id, current_user.id, data)


@router.get("/{discussion_id}", response_model=DiscussionResponse)
def get_discussion(
    project_id: int,
    discussion_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.get_discussion(db, project_id, discussion_id, current_user.id)


@router.patch("/{discussion_id}", response_model=DiscussionResponse)
def update_discussion(
    project_id: int,
    discussion_id: int,
    data: DiscussionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.update_discussion(db, project_id, discussion_id, current_user.id, data)


@router.delete("/{discussion_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_discussion(
    project_id: int,
    discussion_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service.delete_discussion(db, project_id, discussion_id, current_user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/{discussion_id}/pin", response_model=DiscussionResponse)
def pin_discussion(
    project_id: int,
    discussion_id: int,
    data: DiscussionPinUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.pin_discussion(
        db, project_id, discussion_id, current_user.id, is_pinned=data.is_pinned
    )


@router.get("/{discussion_id}/replies", response_model=ReplyListResponse)
def list_replies(
    project_id: int,
    discussion_id: int,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items, total = service.list_replies(
        db, project_id, discussion_id, current_user.id, limit=limit, offset=offset
    )
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.post(
    "/{discussion_id}/replies",
    response_model=ReplyResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_reply(
    project_id: int,
    discussion_id: int,
    data: ReplyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.create_reply(db, project_id, discussion_id, current_user.id, data)


@router.patch("/{discussion_id}/replies/{reply_id}", response_model=ReplyResponse)
def update_reply(
    project_id: int,
    discussion_id: int,
    reply_id: int,
    data: ReplyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.update_reply(
        db, project_id, discussion_id, reply_id, current_user.id, data
    )


@router.delete("/{discussion_id}/replies/{reply_id}", response_model=ReplyResponse)
def delete_reply(
    project_id: int,
    discussion_id: int,
    reply_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.delete_reply(db, project_id, discussion_id, reply_id, current_user.id)


@router.post(
    "/{discussion_id}/reactions",
    response_model=ReactionMutationResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_discussion_reaction(
    project_id: int,
    discussion_id: int,
    data: ReactionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.add_discussion_reaction(
        db, project_id, discussion_id, current_user.id, emoji=data.emoji
    )


@router.delete("/{discussion_id}/reactions", response_model=ReactionMutationResponse)
def remove_discussion_reaction(
    project_id: int,
    discussion_id: int,
    data: ReactionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.remove_discussion_reaction(
        db, project_id, discussion_id, current_user.id, emoji=data.emoji
    )


@router.post(
    "/{discussion_id}/replies/{reply_id}/reactions",
    response_model=ReactionMutationResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_reply_reaction(
    project_id: int,
    discussion_id: int,
    reply_id: int,
    data: ReactionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.add_reply_reaction(
        db, project_id, discussion_id, reply_id, current_user.id, emoji=data.emoji
    )


@router.delete(
    "/{discussion_id}/replies/{reply_id}/reactions",
    response_model=ReactionMutationResponse,
)
def remove_reply_reaction(
    project_id: int,
    discussion_id: int,
    reply_id: int,
    data: ReactionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.remove_reply_reaction(
        db, project_id, discussion_id, reply_id, current_user.id, emoji=data.emoji
    )
