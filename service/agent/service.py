from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import repository
from .agents import AgentSpec, list_agents, require_agent
from .config import get_limits
from .engine import ProviderError, run_turn
from .models import AgentConversation, AgentMessage, AgentPendingAction
from .schemas import (
    AgentResponse,
    ConversationDetailResponse,
    ConversationResponse,
    MessageResponse,
    PendingActionResponse,
    SendMessageResponse,
)
from .tools import ToolContext, ToolError, ensure_tool_available, tools_for_agent
from service.ai.catalog import require_selectable_model
from service.ai.error_classification import classify_error
from service.ai.service import resolve_runtime_config

from typing import Any
from uuid import uuid4


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _json_safe(value: Any) -> dict[str, Any]:
    try:
        json.dumps(value)
        encoded = value
    except (TypeError, ValueError):
        encoded = json.loads(json.dumps(value, default=str))
    if isinstance(encoded, dict):
        return encoded
    return {"result": encoded}


def _conversation_response(conversation: AgentConversation) -> ConversationResponse:
    return ConversationResponse(
        id=conversation.id,
        agent_id=conversation.agent_id,
        title=conversation.title,
        timezone=conversation.timezone,
        provider=conversation.provider,
        model=conversation.model,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
    )


def _message_response(message: AgentMessage) -> MessageResponse:
    return MessageResponse(
        id=message.id,
        role=message.role,
        content=message.content,
        tool_calls=message.tool_calls,
        tool_call_id=message.tool_call_id,
        tool_name=message.tool_name,
        tool_arguments=message.tool_arguments,
        tool_result=message.tool_result,
        metadata=message.execution_metadata,
        created_at=message.created_at,
    )


def _pending_response(action: AgentPendingAction) -> PendingActionResponse:
    return PendingActionResponse(
        id=action.id,
        conversation_id=action.conversation_id,
        agent_id=action.agent_id,
        tool_name=action.tool_name,
        summary=action.summary,
        tool_arguments=action.tool_arguments or {},
        status=action.status,
        result=action.result,
        error=action.error,
        created_at=action.created_at,
        expires_at=action.expires_at,
        resolved_at=action.resolved_at,
    )


# --- Helpers ---

def _conversation_not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found"
    )


def _pending_not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND, detail="Pending action not found"
    )


def _load_conversation(
    db: Session,
    *,
    user_id: int,
    agent_id: str,
    conversation_id: int,
) -> AgentConversation:
    conversation = repository.get_conversation(
        db,
        user_id=user_id,
        agent_id=agent_id,
        conversation_id=conversation_id,
    )
    if conversation is None:
        raise _conversation_not_found()
    return conversation


def _expire_stale(
    db: Session,
    *,
    user_id: int,
    agent_id: str,
    conversation_id: int | None = None,
) -> bool:
    rows = repository.list_pending_actions(
        db,
        user_id=user_id,
        agent_id=agent_id,
        conversation_id=conversation_id,
        status="pending",
    )
    now = _now()
    changed = False
    for action in rows:
        if action.expires_at is not None and action.expires_at <= now:
            action.status = "expired"
            action.resolved_at = now
            changed = True
    return changed


def _append_resolution(
    db: Session,
    action: AgentPendingAction,
    result: dict[str, Any],
    resolution: str,
) -> AgentMessage:
    message = repository.add_message(
        db,
        action.conversation_id,
        role="tool",
        tool_call_id=f"pending_action:{action.id}",
        tool_name=action.tool_name,
        tool_arguments=action.tool_arguments,
        tool_result=result,
        execution_metadata={
            "pending_action_id": action.id,
            "resolution": resolution,
            "status": "error" if "error" in result else result.get("status", resolution),
            "confirmation": "approved" if resolution == "approved" else resolution,
            "event_id": result.get("event_id")
            or (action.tool_arguments or {}).get("event_id"),
            "summary": result.get("summary"),
            "executed_at": _now().isoformat(),
        },
    )
    conversation = db.get(AgentConversation, action.conversation_id)
    if conversation is not None:
        conversation.updated_at = _now()
    return message


# --- Agents ---

def list_agent_specs() -> list[AgentResponse]:
    return [
        AgentResponse(
            id=agent.id,
            page=agent.page,
            title=agent.title,
            description=agent.description,
            enabled=agent.enabled,
            permissions=sorted(agent.permissions),
            tool_count=len(tools_for_agent(agent.id)),
        )
        for agent in list_agents()
    ]


# --- Conversations ---

def _validated_selection(
    db: Session,
    agent: AgentSpec,
    provider: str | None,
    model: str | None,
) -> tuple[str, str] | None:
    """Validate an explicit provider/model selection for an agent.

    Returns ``None`` when no selection was supplied (inherit). Rejects models
    that are missing, disabled or incompatible with the agent instead of
    substituting another model.
    """
    if provider is None and model is None:
        return None
    if not provider or not model:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Select both a provider and a model, or neither.",
        )
    record = require_selectable_model(db, provider, model, agent_id=agent.id)
    return record.provider_id, record.upstream_model_id


def create_conversation(
    db: Session,
    user_id: int,
    agent_id: str,
    title: str | None,
    timezone: str | None = None,
    provider: str | None = None,
    model: str | None = None,
) -> ConversationResponse:
    agent = require_agent(agent_id)
    selection = _validated_selection(db, agent, provider, model)
    conversation = repository.create_conversation(
        db,
        user_id=user_id,
        agent_id=agent.id,
        title=title or "New conversation",
        timezone=timezone,
        provider=selection[0] if selection else None,
        model=selection[1] if selection else None,
    )
    db.commit()
    db.refresh(conversation)
    return _conversation_response(conversation)


def set_conversation_model(
    db: Session,
    user_id: int,
    agent_id: str,
    conversation_id: int,
    provider: str | None,
    model: str | None,
) -> ConversationResponse:
    """Pin this conversation to a model, or clear it with nulls.

    Message history is never modified; only subsequent requests use the new
    selection.
    """
    agent = require_agent(agent_id)
    conversation = _load_conversation(
        db, user_id=user_id, agent_id=agent.id, conversation_id=conversation_id
    )
    selection = _validated_selection(db, agent, provider, model)

    conversation.provider = selection[0] if selection else None
    conversation.model = selection[1] if selection else None
    conversation.updated_at = _now()
    db.commit()
    db.refresh(conversation)
    return _conversation_response(conversation)


def list_conversations(
    db: Session,
    user_id: int,
    agent_id: str,
    *,
    limit: int = 50,
    offset: int = 0,
) -> list[ConversationResponse]:
    require_agent(agent_id)
    rows = repository.list_conversations(
        db, user_id, agent_id, limit=limit, offset=offset
    )
    return [_conversation_response(row) for row in rows]


def get_conversation_detail(
    db: Session, user_id: int, agent_id: str, conversation_id: int
) -> ConversationDetailResponse:
    require_agent(agent_id)
    conversation = _load_conversation(
        db, user_id=user_id, agent_id=agent_id, conversation_id=conversation_id
    )
    _expire_stale(
        db, user_id=user_id, agent_id=agent_id, conversation_id=conversation_id
    )
    db.commit()

    messages = repository.list_messages(db, conversation.id)
    pending = repository.list_pending_actions(
        db,
        user_id=user_id,
        agent_id=agent_id,
        conversation_id=conversation.id,
        status="pending",
    )
    return ConversationDetailResponse(
        conversation=_conversation_response(conversation),
        messages=[_message_response(message) for message in messages],
        pending_actions=[_pending_response(action) for action in pending],
    )


def rename_conversation(
    db: Session,
    user_id: int,
    agent_id: str,
    conversation_id: int,
    title: str,
) -> ConversationResponse:
    require_agent(agent_id)
    conversation = _load_conversation(
        db, user_id=user_id, agent_id=agent_id, conversation_id=conversation_id
    )
    conversation.title = title
    conversation.updated_at = _now()
    db.commit()
    db.refresh(conversation)
    return _conversation_response(conversation)


def delete_conversation(
    db: Session,
    user_id: int,
    agent_id: str,
    conversation_id: int,
) -> None:
    require_agent(agent_id)
    conversation = _load_conversation(
        db, user_id=user_id, agent_id=agent_id, conversation_id=conversation_id
    )
    repository.delete_conversation(db, conversation)
    db.commit()


# --- Messages ---

def send_message(
    db: Session,
    user,
    agent_id: str,
    conversation_id: int,
    content: str,
) -> SendMessageResponse:
    agent = require_agent(agent_id)
    conversation = _load_conversation(
        db, user_id=user.id, agent_id=agent_id, conversation_id=conversation_id
    )
    try:
        result = run_turn(
            db,
            user=user,
            agent=agent,
            conversation=conversation,
            user_text=content,
        )
    except ProviderError as exc:
        # Safe, actionable message; never the raw provider body or credentials.
        classified = exc.classified or classify_error(
            provider_error_message=exc.message
        )
        try:
            runtime = resolve_runtime_config(db, user.id, conversation=conversation)
            provider_id, model_id = runtime.provider, runtime.model
        except Exception:
            provider_id, model_id = "", ""
        try:
            repository.record_provider_diagnostic(
                db,
                request_id=uuid4().hex,
                user_id=user.id,
                agent_id=agent_id,
                conversation_id=conversation.id,
                provider=provider_id,
                model=model_id,
                status=classified.category.name,
                duration_ms=None,
                http_status_code=None,
                provider_error_code=classified.provider_error_code,
                provider_error_message=classified.human_message,
                connected=None,
                headers_received=None,
                streaming_started=None,
                streaming_completed=None,
                connection_interrupted=None,
                retry_attempted=False,
                final_status=classified.category.name,
            )
        except Exception:
            # A diagnostic failure must never block the user-facing error.
            db.rollback()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=exc.message
        )
    return SendMessageResponse(
        messages=[_message_response(message) for message in result.messages],
        pending_actions=[_pending_response(action) for action in result.pending_actions],
    )


# --- Pending actions ---

def list_pending_actions(
    db: Session,
    user_id: int,
    agent_id: str,
    *,
    conversation_id: int | None = None,
) -> list[PendingActionResponse]:
    require_agent(agent_id)
    if conversation_id is not None:
        _load_conversation(
            db, user_id=user_id, agent_id=agent_id, conversation_id=conversation_id
        )
    _expire_stale(
        db, user_id=user_id, agent_id=agent_id, conversation_id=conversation_id
    )
    db.commit()
    rows = repository.list_pending_actions(
        db,
        user_id=user_id,
        agent_id=agent_id,
        conversation_id=conversation_id,
        status="pending",
    )
    return [_pending_response(action) for action in rows]


def approve_pending_action(
    db: Session, user, agent_id: str, action_id: int
) -> PendingActionResponse:
    require_agent(agent_id)
    action = repository.get_pending_action(
        db, user_id=user.id, agent_id=agent_id, action_id=action_id
    )
    if action is None:
        raise _pending_not_found()

    now = _now()
    if action.status == "pending" and action.expires_at <= now:
        action.status = "expired"
        action.resolved_at = now
        db.commit()
    if action.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This pending action is {action.status}.",
        )

    agent: AgentSpec = require_agent(action.agent_id)
    limits = get_limits()

    # Revalidate ownership, permissions and arguments before executing.
    try:
        spec, arguments = ensure_tool_available(
            agent,
            action.tool_name,
            action.tool_arguments or {},
            max_bytes=limits.max_tool_argument_bytes,
        )
    except ToolError as exc:
        action.status = "failed"
        action.error = exc.message
        action.resolved_at = now
        _append_resolution(db, action, {"error": exc.message}, "failed")
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.message
        )

    conversation = db.get(AgentConversation, action.conversation_id)
    context = ToolContext(
        db=db,
        user=user,
        agent=agent,
        conversation_id=action.conversation_id,
        timezone=conversation.timezone if conversation is not None else None,
    )

    try:
        raw_result = spec.handler(context, **arguments)
        result = _json_safe(raw_result)
        result.setdefault("confirmation", "not_required")
    except ToolError as exc:
        action.status = "failed"
        action.error = exc.message
        action.resolved_at = now
        _append_resolution(db, action, {"error": exc.message}, "failed")
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.message
        )
    except Exception:
        safe_error = "The tool could not complete the request."
        action.status = "failed"
        action.error = safe_error
        action.resolved_at = now
        _append_resolution(db, action, {"error": safe_error}, "failed")
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=safe_error
        )

    result.setdefault("confirmation", "approved")
    result.setdefault("event_id", arguments.get("event_id"))
    action.status = "approved"
    action.result = result
    action.resolved_at = now
    _append_resolution(db, action, result, "approved")
    db.commit()
    db.refresh(action)
    return _pending_response(action)


def reject_pending_action(
    db: Session, user, agent_id: str, action_id: int
) -> PendingActionResponse:
    require_agent(agent_id)
    action = repository.get_pending_action(
        db, user_id=user.id, agent_id=agent_id, action_id=action_id
    )
    if action is None:
        raise _pending_not_found()

    now = _now()
    if action.status == "pending" and action.expires_at <= now:
        action.status = "expired"
        action.resolved_at = now
        db.commit()
    if action.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This pending action is {action.status}.",
        )

    action.status = "rejected"
    action.resolved_at = now
    _append_resolution(
        db,
        action,
        {
            "status": "rejected",
            "confirmation": "rejected",
            "event_id": (action.tool_arguments or {}).get("event_id"),
            "message": "The user rejected this action.",
        },
        "rejected",
    )
    db.commit()
    db.refresh(action)
    return _pending_response(action)