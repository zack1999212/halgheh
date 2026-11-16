from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, ForeignKey, Index, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ...core.database import Base

if TYPE_CHECKING:
    from .conversation import AgentConversation


class AgentMessage(Base):
    """A single conversation entry.

    ``role`` is one of ``user``, ``assistant`` or ``tool``. Tool calls and their
    results are stored in structured columns so the distinction between a user
    message, an assistant message, a tool call and a tool result is preserved.
    Credentials are never written here.
    """

    __tablename__ = "agent_messages"
    __table_args__ = (
        Index("ix_agent_messages_conversation", "conversation_id", "id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("agent_conversations.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Assistant tool calls, in OpenAI-compatible shape.
    tool_calls: Mapped[list[dict[str, Any]] | None] = mapped_column(
        JSON, nullable=True
    )
    # Tool result messages.
    tool_call_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    tool_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    tool_arguments: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    tool_result: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    # Execution metadata (counts, pending ids). Never credentials.
    execution_metadata: Mapped[dict[str, Any] | None] = mapped_column(
        JSON, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    conversation: Mapped["AgentConversation"] = relationship(
        "AgentConversation", back_populates="messages"
    )
