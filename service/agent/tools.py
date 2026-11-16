"""Centralized tool registry.

Tools are registered explicitly and are never discovered dynamically. Every
declaration is bound to exactly one agent and to the permission scopes it
requires. The registry is the only place that decides whether the Calendar Agent
may run a tool, so page boundaries do not depend on the frontend.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Callable

from .agents import AgentSpec


class ToolError(Exception):
    """A safe, user-presentable tool validation/execution error."""

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


@dataclass(frozen=True)
class ToolContext:
    """Authenticated execution context.

    These values come from the backend session, never from model-supplied
    arguments, so an agent cannot choose another user's identity or permissions.
    """

    db: Any
    user: Any
    agent: AgentSpec
    conversation_id: int
    timezone: str | None = None


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    input_schema: dict
    agent_id: str
    handler: Callable[..., Any]
    required_permissions: frozenset[str] = field(default_factory=frozenset)
    requires_confirmation: bool = False
    # Optional human-readable preview used for confirmation prompts. It receives
    # the authenticated context so it can resolve titles and times safely.
    describe: Callable[[ToolContext, dict], str] | None = None


_TOOLS: dict[str, ToolSpec] = {}

_NAME_MAX = 64


def register_tool(spec: ToolSpec) -> ToolSpec:
    name = (spec.name or "").strip()
    if not name or len(name) > _NAME_MAX:
        raise ValueError("Tool name must be 1-64 characters")
    if any(ch not in "abcdefghijklmnopqrstuvwxyz0123456789_" for ch in name):
        raise ValueError("Tool name must be lowercase snake_case")
    if name in _TOOLS:
        raise ValueError(f"Tool already registered: {name}")
    if not spec.agent_id:
        raise ValueError("Tool must declare an owning agent")
    if not isinstance(spec.input_schema, dict):
        raise ValueError("Tool input_schema must be an object")
    _TOOLS[name] = spec
    return spec


def get_tool(name: str) -> ToolSpec | None:
    return _TOOLS.get(name)


def list_tools() -> list[ToolSpec]:
    return list(_TOOLS.values())


def tools_for_agent(agent_id: str) -> list[ToolSpec]:
    return [tool for tool in _TOOLS.values() if tool.agent_id == agent_id]


def tool_definitions_for_agent(agent_id: str) -> list[dict]:
    """OpenAI-compatible tool definitions, scoped to one agent."""
    return [
        {
            "type": "function",
            "function": {
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.input_schema or {"type": "object", "properties": {}},
            },
        }
        for tool in tools_for_agent(agent_id)
    ]


# --- Validation ---

_JSON_TYPES = {
    "string": str,
    "number": (int, float),
    "integer": int,
    "boolean": bool,
    "array": list,
    "object": dict,
}


def _check_value(value: Any, schema: dict, key: str) -> None:
    expected = schema.get("type")
    if expected in _JSON_TYPES:
        py_type = _JSON_TYPES[expected]
        # bool is a subclass of int; keep integer/number strict.
        if expected in ("integer", "number") and isinstance(value, bool):
            raise ToolError(f"Argument '{key}' must be a {expected}")
        if not isinstance(value, py_type):
            raise ToolError(f"Argument '{key}' must be a {expected}")
    enum = schema.get("enum")
    if isinstance(enum, list) and value not in enum:
        raise ToolError(f"Argument '{key}' must be one of: {', '.join(map(str, enum))}")
    if isinstance(value, str):
        max_length = schema.get("maxLength")
        if isinstance(max_length, int) and len(value) > max_length:
            raise ToolError(f"Argument '{key}' is too long")


def validate_arguments(spec: ToolSpec, args: dict, *, max_bytes: int) -> dict:
    if not isinstance(args, dict):
        raise ToolError("Tool arguments must be a JSON object")
    try:
        encoded = json.dumps(args)
    except (TypeError, ValueError):
        raise ToolError("Tool arguments must be valid JSON")
    if len(encoded.encode("utf-8")) > max_bytes:
        raise ToolError("Tool arguments exceed the maximum allowed size")

    schema = spec.input_schema or {}
    properties = schema.get("properties") or {}
    required = schema.get("required") or []

    for key in required:
        if key not in args:
            raise ToolError(f"Missing required argument '{key}'")

    if schema.get("additionalProperties") is False:
        unexpected = set(args) - set(properties)
        if unexpected:
            raise ToolError(
                "Unexpected argument(s): " + ", ".join(sorted(unexpected))
            )

    for key, value in args.items():
        prop_schema = properties.get(key)
        if isinstance(prop_schema, dict):
            _check_value(value, prop_schema, key)

    return args


def ensure_tool_available(
    agent: AgentSpec, name: str, args: dict, *, max_bytes: int
) -> tuple[ToolSpec, dict]:
    """Resolve a tool for an agent and validate ownership, scope and arguments."""
    spec = get_tool(name)
    if spec is None:
        raise ToolError("Unknown tool")
    if spec.agent_id != agent.id:
        # A Calendar Agent can never run a Tasks/Documents tool even if the model
        # hallucinates its name.
        raise ToolError("This tool is not available to this agent")
    if not spec.required_permissions.issubset(agent.permissions):
        raise ToolError("This agent does not have permission to run this tool")
    validate_arguments(spec, args, max_bytes=max_bytes)
    return spec, args
