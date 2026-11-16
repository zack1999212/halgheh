"""Provider-driven agent execution loop.

The engine resolves the user's effective provider through Task 1, sends the
conversation and registered tool definitions, executes non-confirmed tools, and
proposes confirmation-required tools as pending actions. It never uses a
model-supplied user id or permission scope, and it never exposes credentials.
"""

from __future__ import annotations

import json
import socket
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from ..ai.providers import build_request_config, get_provider
from ..ai.service import resolve_runtime_config
from . import repository
from .agents import AgentSpec
from .config import get_limits
from .models import AgentMessage, AgentPendingAction
from .tools import (
    ToolContext,
    ToolError,
    ToolSpec,
    ensure_tool_available,
    tool_definitions_for_agent,
    tools_for_agent,
)


class ProviderError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


@dataclass
class TurnResult:
    messages: list[AgentMessage]
    pending_actions: list[AgentPendingAction]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _provider_messages(history: list[AgentMessage]) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = []
    for message in history:
        if message.role == "user":
            messages.append({"role": "user", "content": message.content or ""})
        elif message.role == "assistant":
            item: dict[str, Any] = {
                "role": "assistant",
                "content": message.content or "",
            }
            if message.tool_calls:
                item["tool_calls"] = message.tool_calls
            messages.append(item)
        elif message.role == "tool":
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": message.tool_call_id or "",
                    "content": json.dumps(message.tool_result or {}),
                }
            )
    return messages


def _post_json(
    url: str, headers: dict[str, str], body: dict[str, Any], timeout: int
) -> dict[str, Any]:
    data = json.dumps(body).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
    except urllib.error.HTTPError as exc:
        code = exc.code
        if code in (401, 403):
            raise ProviderError(
                "The AI provider rejected the credentials. Check your AI settings."
            )
        if code == 404:
            raise ProviderError(
                "The AI provider endpoint or model was not found. Check your AI settings."
            )
        if code == 429:
            raise ProviderError(
                "The AI provider is rate limiting requests. Please try again shortly."
            )
        if code >= 500:
            raise ProviderError(
                "The AI provider is temporarily unavailable. Please try again."
            )
        if code == 400:
            raise ProviderError(
                "The AI provider rejected the request. The selected model may "
                "not support the required operations."
            )
        raise ProviderError("The AI provider rejected the request.")
    except (urllib.error.URLError, TimeoutError, socket.timeout):
        raise ProviderError(
            "Could not reach the AI provider. Check your connection and try again."
        )

    try:
        return json.loads(raw)
    except ValueError:
        raise ProviderError("The AI provider returned an invalid response.")


def _extract_message(data: dict[str, Any]) -> tuple[str | None, list[dict[str, Any]]]:
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        raise ProviderError("The AI provider returned no response.")
    message = choices[0].get("message") or {}
    content = message.get("content")
    if content is not None and not isinstance(content, str):
        content = str(content)
    tool_calls = message.get("tool_calls") or []
    if not isinstance(tool_calls, list):
        tool_calls = []
    return content, tool_calls


def _parse_tool_call(
    call: Any,
) -> tuple[str, dict[str, Any] | None, str, str | None]:
    if not isinstance(call, dict):
        return "", None, "", "Malformed tool call"
    call_id = str(call.get("id") or "")
    function = call.get("function") or {}
    name = str(function.get("name") or "").strip()
    if not name:
        return "", None, call_id, "Tool call did not include a name"

    raw_arguments = function.get("arguments")
    if isinstance(raw_arguments, dict):
        arguments = raw_arguments
    elif isinstance(raw_arguments, str):
        if not raw_arguments.strip():
            arguments = {}
        else:
            try:
                arguments = json.loads(raw_arguments)
            except ValueError:
                return name, None, call_id, "Tool arguments were not valid JSON"
    else:
        arguments = {}

    if not isinstance(arguments, dict):
        return name, None, call_id, "Tool arguments must be a JSON object"
    return name, arguments, call_id, None


def _json_safe(value: Any) -> dict[str, Any]:
    try:
        json.dumps(value)
        encoded = value
    except (TypeError, ValueError):
        encoded = json.loads(json.dumps(value, default=str))
    if isinstance(encoded, dict):
        return encoded
    return {"result": encoded}


def _truncate_result(result: dict[str, Any], max_bytes: int) -> dict[str, Any]:
    try:
        text = json.dumps(result)
    except (TypeError, ValueError):
        return {"result": "The tool returned an unsupported result."}
    if len(text.encode("utf-8")) <= max_bytes:
        return result
    return {
        "truncated": True,
        "preview": text[:max_bytes],
    }


def _summary(
    spec: ToolSpec,
    arguments: dict[str, Any],
    agent: AgentSpec,
    context: ToolContext,
) -> str:
    if spec.describe is not None:
        try:
            preview = spec.describe(context, arguments)
            if isinstance(preview, str) and preview.strip():
                return preview.strip()[:1000]
        except Exception:
            # A preview failure must never block the confirmation flow.
            pass
    detail = json.dumps(arguments)[:300] if arguments else "no arguments"
    return f"{agent.title}: {spec.description} ({detail})"


def _execution_metadata(
    result: dict[str, Any],
    arguments: dict[str, Any] | None,
    *,
    confirmation: str,
) -> dict[str, Any]:
    event_id = result.get("event_id")
    if event_id is None and arguments:
        event_id = arguments.get("event_id")
    return {
        "status": "error" if "error" in result else result.get("status", "succeeded"),
        "event_id": event_id,
        "confirmation": confirmation,
        "summary": result.get("summary"),
        "executed_at": _now().isoformat(),
    }


def _append_tool_message(
    db: Session,
    conversation_id: int,
    *,
    call_id: str,
    name: str,
    arguments: dict[str, Any] | None,
    result: dict[str, Any],
    metadata: dict[str, Any] | None = None,
) -> AgentMessage:
    message = repository.add_message(
        db,
        conversation_id,
        role="tool",
        tool_call_id=call_id,
        tool_name=name or None,
        tool_arguments=arguments,
        tool_result=result,
        execution_metadata=metadata,
    )
    return message


def run_turn(
    db: Session,
    *,
    user,
    agent: AgentSpec,
    conversation,
    user_text: str,
) -> TurnResult:
    limits = get_limits()
    now = _now()

    user_message = repository.add_message(
        db, conversation.id, role="user", content=user_text
    )
    if not conversation.title or conversation.title == "New conversation":
        conversation.title = (user_text.strip()[:80] or "New conversation")
    repository.touch_conversation(db, conversation, now=now)
    db.commit()

    # Resolve the effective provider (personal first, then application default).
    config = resolve_runtime_config(db, user.id)
    if not config.api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "The AI provider is not configured. Add an API key in AI settings."
            ),
        )
    provider = get_provider(config.provider)
    if provider is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The configured AI provider is not supported.",
        )
    if not config.base_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "The AI provider endpoint is not configured. Set it in AI settings."
            ),
        )

    tool_specs = tools_for_agent(agent.id)
    if tool_specs and config.capabilities.tool_calling is not True:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "The selected model does not support tool calling. "
                "Choose a compatible model in AI settings."
            ),
        )

    request_config = build_request_config(
        provider=provider,
        base_url=config.base_url,
        api_key=config.api_key,
        model=config.model,
        extra=config.extra,
    )
    if not request_config.url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not build the AI provider request URL.",
        )

    history = repository.list_messages(
        db, conversation.id, limit=limits.max_context_messages
    )
    # A limited window can start in the middle of a tool exchange. Drop leading
    # non-user entries so a tool result is never sent without its matching
    # assistant tool_calls (or the reverse), which providers reject.
    while history and history[0].role != "user":
        history.pop(0)
    # Relative dates are interpreted against backend time in the conversation's
    # timezone, never against the model's own notion of today.
    tz_name = getattr(conversation, "timezone", None) or None
    local_now = now
    if tz_name:
        try:
            local_now = datetime.now(ZoneInfo(tz_name))
        except (ZoneInfoNotFoundError, ValueError, KeyError):
            tz_name = None
    context_note = (
        f"\n\nBackend current date and time: {local_now.isoformat()} "
        f"(timezone: {tz_name or 'UTC'}). Use this as the source of truth for "
        "relative dates such as today, tomorrow, or next week."
    )
    provider_messages: list[dict[str, Any]] = [
        {"role": "system", "content": agent.system_prompt + context_note}
    ] + _provider_messages(history)

    tool_definitions = tool_definitions_for_agent(agent.id)

    context = ToolContext(
        db=db,
        user=user,
        agent=agent,
        conversation_id=conversation.id,
        timezone=tz_name,
    )

    # Include the user message so a send response is self-contained.
    created: list[AgentMessage] = [user_message]
    proposed: list[AgentPendingAction] = []
    tool_calls_used = 0
    finished = False

    while not finished:
        body: dict[str, Any] = {
            "model": config.model,
            "messages": provider_messages,
        }
        # Provider-specific request options (AI_DEFAULT_EXTRA_CONFIG or a
        # personal extra_config) may add parameters, never override the model,
        # messages or tool definitions built here.
        for key, value in (config.extra or {}).items():
            if key not in body:
                body[key] = value
        if tool_definitions:
            body["tools"] = tool_definitions
            body["tool_choice"] = "auto"

        data = _post_json(
            request_config.url,
            request_config.headers,
            body,
            limits.provider_timeout_seconds,
        )
        content, tool_calls = _extract_message(data)

        if not tool_calls:
            message = repository.add_message(
                db,
                conversation.id,
                role="assistant",
                content=content or "",
            )
            created.append(message)
            repository.touch_conversation(db, conversation, now=_now())
            db.commit()
            finished = True
            break

        assistant = repository.add_message(
            db,
            conversation.id,
            role="assistant",
            content=content,
            tool_calls=tool_calls,
        )
        created.append(assistant)
        db.flush()
        provider_messages.append(
            {"role": "assistant", "content": content or "", "tool_calls": tool_calls}
        )

        for call in tool_calls:
            name, arguments, call_id, parse_error = _parse_tool_call(call)
            tool_calls_used += 1
            if tool_calls_used > limits.max_tool_calls_per_turn:
                result = {
                    "error": "Tool call limit reached for this turn. Ask the user to continue."
                }
                appended = _append_tool_message(
                    db,
                    conversation.id,
                    call_id=call_id,
                    name=name,
                    arguments=None,
                    result=result,
                    metadata=_execution_metadata(
                        result, None, confirmation="not_required"
                    ),
                )
                created.append(appended)
                provider_messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call_id,
                        "content": json.dumps(result),
                    }
                )
                finished = True
                break

            if parse_error:
                result = {"error": parse_error}
                appended = _append_tool_message(
                    db,
                    conversation.id,
                    call_id=call_id,
                    name=name,
                    arguments=None,
                    result=result,
                    metadata=_execution_metadata(
                        result, None, confirmation="not_required"
                    ),
                )
                created.append(appended)
                provider_messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call_id,
                        "content": json.dumps(result),
                    }
                )
                continue

            try:
                spec, valid_arguments = ensure_tool_available(
                    agent,
                    name,
                    arguments or {},
                    max_bytes=limits.max_tool_argument_bytes,
                )
            except ToolError as exc:
                result = {"error": exc.message}
                appended = _append_tool_message(
                    db,
                    conversation.id,
                    call_id=call_id,
                    name=name,
                    arguments=arguments,
                    result=result,
                    metadata=_execution_metadata(
                        result, arguments, confirmation="not_required"
                    ),
                )
                created.append(appended)
                provider_messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call_id,
                        "content": json.dumps(result),
                    }
                )
                continue

            if spec.requires_confirmation:
                action = repository.create_pending_action(
                    db,
                    conversation_id=conversation.id,
                    user_id=user.id,
                    agent_id=agent.id,
                    tool_name=spec.name,
                    tool_arguments=valid_arguments,
                    summary=_summary(spec, valid_arguments, agent, context),
                    expires_at=_now()
                    + timedelta(seconds=limits.pending_action_ttl_seconds),
                )
                db.flush()
                proposed.append(action)
                result = {
                    "status": "pending_confirmation",
                    "pending_action_id": action.id,
                    "message": "This action requires the user's explicit approval.",
                }
                appended = repository.add_message(
                    db,
                    conversation.id,
                    role="tool",
                    tool_call_id=call_id,
                    tool_name=spec.name,
                    tool_arguments=valid_arguments,
                    tool_result=result,
                    execution_metadata={
                        "pending_action_id": action.id,
                        "status": "pending_confirmation",
                        "event_id": valid_arguments.get("event_id"),
                        "confirmation": "pending",
                        "summary": action.summary,
                        "executed_at": _now().isoformat(),
                    },
                )
                created.append(appended)
                repository.touch_conversation(db, conversation, now=_now())
                db.commit()
                finished = True
                break

            try:
                raw_result = spec.handler(context, **valid_arguments)
                result = _truncate_result(
                    _json_safe(raw_result), limits.max_tool_result_bytes
                )
                result.setdefault("confirmation", "not_required")
            except ToolError as exc:
                result = {"error": exc.message}
            except Exception:
                # Never leak exception traces or provider internals.
                result = {"error": "The tool could not complete the request."}

            appended = _append_tool_message(
                db,
                conversation.id,
                call_id=call_id,
                name=spec.name,
                arguments=valid_arguments,
                result=result,
                metadata=_execution_metadata(
                    result, valid_arguments, confirmation="not_required"
                ),
            )
            created.append(appended)
            provider_messages.append(
                {
                    "role": "tool",
                    "tool_call_id": call_id,
                    "content": json.dumps(result),
                }
            )

        if finished:
            repository.touch_conversation(db, conversation, now=_now())
            db.commit()
            break

        # Loop back so the model can react to the tool results.
        repository.touch_conversation(db, conversation, now=_now())
        db.commit()

    repository.touch_conversation(db, conversation, now=_now())
    db.commit()
    return TurnResult(messages=created, pending_actions=proposed)
