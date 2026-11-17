from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from ..auth.dependencies import get_current_user
from ..auth.models import User
from ..core.database import get_db
from . import service
from .schemas import (
    AgentResponse,
    ConversationCreate,
    ConversationDetailResponse,
    ConversationModelUpdate,
    ConversationResponse,
    ConversationUpdate,
    PendingActionResponse,
    SendMessageRequest,
    SendMessageResponse,
)

router = APIRouter(prefix="/agents", tags=["agents"])


# --- Agents ---


@router.get("", response_model=list[AgentResponse])
def list_agents(
    current_user: User = Depends(get_current_user),
):
    return service.list_agent_specs()


# --- Conversations ---


@router.post(
    "/{agent_id}/conversations",
    response_model=ConversationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_conversation(
    agent_id: str,
    data: ConversationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.create_conversation(
        db,
        current_user.id,
        agent_id,
        data.title,
        data.timezone,
        data.provider,
        data.model,
    )


@router.get(
    "/{agent_id}/conversations", response_model=list[ConversationResponse]
)
def list_conversations(
    agent_id: str,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.list_conversations(
        db, current_user.id, agent_id, limit=limit, offset=offset
    )


@router.get(
    "/{agent_id}/conversations/{conversation_id}",
    response_model=ConversationDetailResponse,
)
def get_conversation(
    agent_id: str,
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.get_conversation_detail(
        db, current_user.id, agent_id, conversation_id
    )


@router.patch(
    "/{agent_id}/conversations/{conversation_id}/model",
    response_model=ConversationResponse,
)
def set_conversation_model(
    agent_id: str,
    conversation_id: int,
    data: ConversationModelUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Pin this conversation to a provider/model without touching its history."""
    return service.set_conversation_model(
        db,
        current_user.id,
        agent_id,
        conversation_id,
        data.provider,
        data.model,
    )


@router.patch(
    "/{agent_id}/conversations/{conversation_id}",
    response_model=ConversationResponse,
)
def rename_conversation(
    agent_id: str,
    conversation_id: int,
    data: ConversationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.rename_conversation(
        db, current_user.id, agent_id, conversation_id, data.title
    )


@router.delete(
    "/{agent_id}/conversations/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_conversation(
    agent_id: str,
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service.delete_conversation(db, current_user.id, agent_id, conversation_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Messages ---


@router.post(
    "/{agent_id}/conversations/{conversation_id}/messages",
    response_model=SendMessageResponse,
)
def send_message(
    agent_id: str,
    conversation_id: int,
    data: SendMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.send_message(
        db, current_user, agent_id, conversation_id, data.content
    )


# --- Pending actions ---


@router.get(
    "/{agent_id}/pending-actions", response_model=list[PendingActionResponse]
)
def list_pending_actions(
    agent_id: str,
    conversation_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.list_pending_actions(
        db, current_user.id, agent_id, conversation_id=conversation_id
    )


@router.post(
    "/{agent_id}/pending-actions/{action_id}/approve",
    response_model=PendingActionResponse,
)
def approve_pending_action(
    agent_id: str,
    action_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.approve_pending_action(db, current_user, agent_id, action_id)


@router.post(
    "/{agent_id}/pending-actions/{action_id}/reject",
    response_model=PendingActionResponse,
)
def reject_pending_action(
    agent_id: str,
    action_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.reject_pending_action(db, current_user, agent_id, action_id)
