from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ...core.database import Base

if TYPE_CHECKING:
    from ...auth.models import User
    from .event import Event


class Calendar(Base):
    __tablename__ = "calendars"
    __table_args__ = (
        Index("ix_calendars_user_id", "user_id"),
        Index(
            "uq_calendars_user_default",
            "user_id",
            unique=True,
            postgresql_where=text("is_default = true"),
        ),
        CheckConstraint("length(name) > 0", name="ck_calendars_name_not_empty"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    color: Mapped[str | None] = mapped_column(String, nullable=True)
    is_default: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    user: Mapped["User"] = relationship("User", back_populates="calendars")
    events: Mapped[list["Event"]] = relationship(
        "Event",
        back_populates="calendar",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
