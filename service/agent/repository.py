from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import select

from sqlalchemy.orm import Session

from .models import AgentConversation, AgentMessage, AgentPendingAction, ProviderDiagnostic


# --- Conversations ---

def create_conversation(
    db: Session,
    *,
    user_id: int,
    agent_id: str,
    title: str,
    timezone: str | None = None,
    provider: str | None = None,
    model: str | None = None,
) -> AgentConversation:
    conversation = AgentConversation(
        user_id=user_id,
        agent_id=agent_id,
        title=title,
        timezone=timezone,
        provider=provider,
        model=model,
    )
    db.add(conversation)
    return conversation


def list_conversations(
    db: Session, user_id: int, agent_id: str, *, limit: int = 50, offset: int = 0
) -> list[AgentConversation]:
    stmt = (
        select(AgentConversation)
        .where(
            AgentConversation.user_id == user_id,
            AgentConversation.agent_id == agent_id,
        )
        .order_by(
            AgentConversation.updated_at.desc(), AgentConversation.id.desc()
        )
        .limit(limit)
        .offset(offset)
    )
    return list(db.scalars(stmt).all())


def get_conversation(
    db: Session,
    *,
    user_id: int,
    agent_id: str,
    conversation_id: int,
) -> AgentConversation | None:
    stmt = select(AgentConversation).where(
        AgentConversation.id == conversation_id,
        AgentConversation.user_id == user_id,
        AgentConversation.agent_id == agent_id,
    )
    return db.scalars(stmt).first()


def touch_conversation(
    db: Session, conversation: AgentConversation, *, now: datetime
) -> None:
    conversation.updated_at = now


def delete_conversation(db: Session, conversation: AgentConversation) -> None:
    db.delete(conversation)


# --- Messages ---

def add_message(
    db: Session,
    conversation_id: int,
    *,
    role: str,
    content: str | None = None,
    tool_calls: list[dict[str, Any]] | None = None,
    tool_call_id: str | None = None,
    tool_name: str | None = None,
    tool_arguments: dict[str, Any] | None = None,
    tool_result: dict[str, Any] | None = None,
    execution_metadata: dict[str, Any] | None = None,
) -> AgentMessage:
    message = AgentMessage(
        conversation_id=conversation_id,
        role=role,
        content=content,
        tool_calls=tool_calls,
        tool_call_id=tool_call_id,
        tool_name=tool_name,
        tool_arguments=tool_arguments,
        tool_result=tool_result,
        execution_metadata=execution_metadata,
    )
    db.add(message)
    return message


def list_messages(
    db: Session, conversation_id: int, *, limit: int | None = None
) -> list[AgentMessage]:
    stmt = (
        select(AgentMessage)
        .where(AgentMessage.conversation_id == conversation_id)
        .order_by(AgentMessage.id.asc())
    )
    if limit is not None:
        # Newest window, returned oldest-first for provider context.
        stmt = (
            select(AgentMessage)
            .where(AgentMessage.conversation_id == conversation_id)
            .order_by(AgentMessage.id.desc())
            .limit(limit)
        )
        rows = list(db.scalars(stmt).all())
        rows.reverse()
        return rows
    return list(db.scalars(stmt).all())


# --- Pending actions ---

def create_pending_action(
    db: Session,
    *,
    conversation_id: int,
    user_id: int,
    agent_id: str,
    tool_name: str,
    tool_arguments: dict[str, Any],
    summary: str | None,
    expires_at: datetime,
) -> AgentPendingAction:
    action = AgentPendingAction(
        conversation_id=conversation_id,
        user_id=user_id,
        agent_id=agent_id,
        tool_name=tool_name,
        tool_arguments=tool_arguments,
        summary=summary,
        status="pending",
        expires_at=expires_at,
    )
    db.add(action)
    return action


def get_pending_action(
    db: Session, *, user_id: int, agent_id: str, action_id: int
) -> AgentPendingAction | None:
    stmt = select(AgentPendingAction).where(
        AgentPendingAction.id == action_id,
        AgentPendingAction.user_id == user_id,
        AgentPendingAction.agent_id == agent_id,
    )
    return db.scalars(stmt).first()


def list_pending_actions(
    db: Session,
    *,
    user_id: int,
    agent_id: str,
    conversation_id: int | None = None,
    status: str | None = "pending",
) -> list[AgentPendingAction]:
    stmt = select(AgentPendingAction).where(
        AgentPendingAction.user_id == user_id,
        AgentPendingAction.agent_id == agent_id,
    )
    if conversation_id is not None:
        stmt = stmt.where(
            AgentPendingAction.conversation_id == conversation_id
        )
    if status is not None:
        stmt = stmt.where(AgentPendingAction.status == status)
    stmt = stmt.order_by(AgentPendingAction.id.asc())
    return list(db.scalars(stmt).all())


# --- Provider diagnostics ---

def record_provider_diagnostic(
    db: Session,
    *,
    request_id: str,
    user_id: int,
    agent_id: str,
    conversation_id: int | None,
    provider: str,
    model: str,
    status: str,
    duration_ms: int | None,
    http_status_code: int | None,
    provider_error_code: str | None,
    provider_error_message: str,
    connected: bool | None,
    headers_received: bool | None,
    streaming_started: bool | None,
    streaming_completed: bool | None,
    connection_interrupted: bool | None,
    retry_attempted: bool | None,
    final_status: str | None,
) -> None:
    """Persist a provider request diagnostic record.

    Sensitive data (API keys, auth headers) are never stored.
    Provider error messages are sanitized before persisting.
    The record is associated with the correct user and conversation.
    """
    diagnostic = ProviderDiagnostic(
        request_id=request_id,
        user_id=user_id,
        conversation_id=conversation_id,
        provider=provider,
        model=model,
        attempt=1,  # TODO: track actual attempt number if needed
        status=status,
        duration_ms=duration_ms,
        http_status_code=http_status_code,
        provider_error_code=provider_error_code,
        provider_error_message=provider_error_message,
        connected=connected,
        headers_received=headers_received,
        streaming_started=streaming_started,
        streaming_completed=streaming_completed,
        connection_interrupted=connection_interrupted,
        retry_attempted=retry_attempted,
        final_status=final_status,
    )
    db.add(diagnostic)
    db.commit()