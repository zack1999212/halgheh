from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..core.database import Base

if TYPE_CHECKING:
    from ..agent.models import AgentConversation
    from ..ai.models import AICredential
    from ..calendar.models import Calendar
    from ..notifications.models import NotificationPreference


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Usernames are stored trimmed and lowercase. The unique index enforces
    # case-insensitive identity at the database level.
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    email_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    name: Mapped[str] = mapped_column(String, default="")
    hashed_password: Mapped[str] = mapped_column(String)
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # Incremented on password change, reset, logout and logout-everywhere so
    # every previously issued access token becomes invalid immediately.
    token_version: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )

    calendars: Mapped[list["Calendar"]] = relationship(
        "Calendar",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    notifications: Mapped[list["Notification"]] = relationship(
        "Notification",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    ai_credentials: Mapped[list["AICredential"]] = relationship(
        "AICredential",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    agent_conversations: Mapped[list["AgentConversation"]] = relationship(
        "AgentConversation",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    notification_preference: Mapped["NotificationPreference | None"] = relationship(
        "NotificationPreference",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
        uselist=False,
    )


class AuthToken(Base):
    """Single-use / rotating server-side token records.

    Refresh tokens are rotated on every use (the old hash is marked used),
    while email-verification and password-reset tokens are single-use.
    Only SHA-256 hashes are stored, never the raw token.
    """

    __tablename__ = "auth_tokens"
    __table_args__ = (
        UniqueConstraint("token_hash", name="uq_auth_tokens_token_hash"),
        Index("ix_auth_tokens_user_id", "user_id"),
        Index("ix_auth_tokens_user_type", "user_id", "type"),
    )

    TOKEN_REFRESH = "refresh"
    TOKEN_RESET = "reset"
    TOKEN_VERIFY = "verify"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    type: Mapped[str] = mapped_column(String(16), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    user: Mapped["User"] = relationship("User")
