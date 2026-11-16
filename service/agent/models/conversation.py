from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ...core.database import Base

if TYPE_CHECKING:
    from ...auth.models import User
    from .message import AgentMessage
    from .pending_action import AgentPendingAction


class AgentConversation(Base):
    __tablename__ = "agent_conversations"
    __table_args__ = (
        Index(
            "ix_agent_conversations_user_agent",
            "user_id",
            "agent_id",
            "updated_at",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    agent_id: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(
        String(200), nullable=False, default="New conversation"
    )
    # IANA timezone supplied by the client for interpreting relative dates.
    timezone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    user: Mapped["User"] = relationship("User", back_populates="agent_conversations")
    messages: Mapped[list["AgentMessage"]] = relationship(
        "AgentMessage",
        back_populates="conversation",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="AgentMessage.id",
    )
    pending_actions: Mapped[list["AgentPendingAction"]] = relationship(
        "AgentPendingAction",
        back_populates="conversation",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
