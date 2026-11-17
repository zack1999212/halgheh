from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ...core.database import Base


class ProviderDiagnostic(Base):
    """Persistent diagnostic record for a single AI provider request.

    Every provider request produces a record so failures can be investigated
    after the request ends.  Sensitive data (API keys, auth headers) are never
    stored; provider error messages are sanitized before persisting.
    """

    __tablename__ = "provider_diagnostics"

    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[str] = mapped_column(
        String(64), nullable=False, unique=True, index=True
    )
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("agent_conversations.id", ondelete="CASCADE"), nullable=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    model: Mapped[str] = mapped_column(String(64), nullable=False)
    attempt: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )
    duration_ms: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )
    http_status_code: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )
    provider_error_code: Mapped[str | None] = mapped_column(
        String(32), nullable=True
    )
    provider_error_message: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )
    connected: Mapped[bool | None] = mapped_column(
        Boolean, nullable=True
    )
    headers_received: Mapped[bool | None] = mapped_column(
        Boolean, nullable=True
    )
    streaming_started: Mapped[bool | None] = mapped_column(
        Boolean, nullable=True
    )
    streaming_completed: Mapped[bool | None] = mapped_column(
        Boolean, nullable=True
    )
    connection_interrupted: Mapped[bool | None] = mapped_column(
        Boolean, nullable=True
    )
    retry_attempted: Mapped[bool | None] = mapped_column(
        Boolean, nullable=True
    )
    final_status: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    conversation: Mapped["AgentConversation"] = relationship(
        "AgentConversation", back_populates="provider_diagnostics"
    )