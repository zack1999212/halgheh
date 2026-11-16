"""Execution limits for agent turns (environment-configurable)."""

from __future__ import annotations

import os
from dataclasses import dataclass


def _int(name: str, default: int, *, minimum: int = 1, maximum: int = 100000) -> int:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return max(minimum, min(maximum, value))


@dataclass(frozen=True)
class AgentLimits:
    max_tool_calls_per_turn: int
    max_context_messages: int
    provider_timeout_seconds: int
    tool_timeout_seconds: int
    max_tool_argument_bytes: int
    max_tool_result_bytes: int
    pending_action_ttl_seconds: int


def get_limits() -> AgentLimits:
    return AgentLimits(
        max_tool_calls_per_turn=_int("AGENT_MAX_TOOL_CALLS_PER_TURN", 8, maximum=50),
        max_context_messages=_int("AGENT_MAX_CONTEXT_MESSAGES", 40, maximum=200),
        provider_timeout_seconds=_int(
            "AGENT_PROVIDER_TIMEOUT_SECONDS", 60, maximum=300
        ),
        tool_timeout_seconds=_int("AGENT_TOOL_TIMEOUT_SECONDS", 30, maximum=300),
        max_tool_argument_bytes=_int(
            "AGENT_MAX_TOOL_ARGUMENT_BYTES", 10000, maximum=1000000
        ),
        max_tool_result_bytes=_int(
            "AGENT_MAX_TOOL_RESULT_BYTES", 50000, maximum=2000000
        ),
        pending_action_ttl_seconds=_int(
            "AGENT_PENDING_ACTION_TTL_SECONDS", 900, maximum=86400
        ),
    )
