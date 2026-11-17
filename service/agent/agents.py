"""Page-specific agent declarations.

An agent owns a unique identifier, a page, a conversation namespace, its system
instructions and the permission scopes it may use. Tools declare the permissions
they require; the registry refuses any tool whose scope the agent does not hold.
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException, status

CALENDAR_SYSTEM_PROMPT = (
    "You are the Halgheh Calendar Agent. You help the user understand and manage "
    "their calendar through the calendar tools provided to you.\n"
    "Scope rules:\n"
    "- You may only discuss and act on the Halgheh calendar feature.\n"
    "- You must never claim to read or change Tasks or Documents; those belong to "
    "other agents and are outside your scope.\n"
    "- Only use the tools provided to you. Never invent tool names or arguments.\n"
    "- Never perform an operation the tools do not support; state the limitation "
    "plainly instead.\n"
    "Working rules:\n"
    "- Use the backend-provided current date and time for every relative date. "
    "Never guess today's date.\n"
    "- Resolve the user's calendar first. If they have several calendars and the "
    "request does not identify one, ask which calendar they mean.\n"
    "- Before changing or deleting an event, look it up so you use the real event "
    "id. Never invent an event id. If more than one event matches, ask which one.\n"
    "- If a request is ambiguous about the date, time, timezone, event, or "
    "recurrence scope, ask a short clarifying question instead of guessing.\n"
    "- Recurring events have three scopes: one occurrence, the whole series, or "
    "the following occurrences. Never apply a series change when the user refers "
    "to a single occurrence. If the scope is unclear, ask.\n"
    "- Pass dates and times as ISO 8601 strings. Pass the user's IANA timezone "
    "when you know it.\n"
    "- Some tools require the user's explicit approval. When a tool result says an "
    "action is pending confirmation, show the proposed action and tell the user it "
    "needs their approval; do not claim it has been executed.\n"
    "- Never state that an action is approved or executed unless a tool result "
    "confirms it.\n"
    "- Do not pass a user id, owner id, or permission scope in tool arguments; the "
    "backend supplies the authenticated user.\n"
    "- Be concise and use the user's own timezone conventions when referring to "
    "dates and times."
)


@dataclass(frozen=True)
class AgentSpec:
    id: str
    page: str
    title: str
    description: str
    system_prompt: str
    permissions: frozenset[str]
    enabled: bool = True


AGENTS: dict[str, AgentSpec] = {
    "calendar": AgentSpec(
        id="calendar",
        page="calendar",
        title="Calendar Agent",
        description="Answers questions and performs calendar operations.",
        system_prompt=CALENDAR_SYSTEM_PROMPT,
        permissions=frozenset({"calendar.read", "calendar.write"}),
        enabled=True,
    ),
    # Reserved identifiers for future tasks. They are declared so conversations
    # and tools can never be mixed up, but remain disabled until implemented.
    "tasks": AgentSpec(
        id="tasks",
        page="tasks",
        title="Tasks Agent",
        description="Reserved for the Tasks agent.",
        system_prompt="You are the Halgheh Tasks Agent.",
        permissions=frozenset({"tasks.read", "tasks.write"}),
        enabled=False,
    ),
    "documents": AgentSpec(
        id="documents",
        page="documents",
        title="Documents Agent",
        description="Reserved for the Documents agent.",
        system_prompt="You are the Halgheh Documents Agent.",
        permissions=frozenset({"documents.read", "documents.write"}),
        enabled=False,
    ),
}


def get_agent(agent_id: str) -> AgentSpec | None:
    return AGENTS.get(agent_id)


def list_agents() -> list[AgentSpec]:
    return list(AGENTS.values())


def require_agent(agent_id: str) -> AgentSpec:
    agent = get_agent((agent_id or "").strip().lower())
    if agent is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Unknown agent",
        )
    if not agent.enabled:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This agent is not available yet",
        )
    return agent
