from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, String, func
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
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String, default="")
    hashed_password: Mapped[str] = mapped_column(String)
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
