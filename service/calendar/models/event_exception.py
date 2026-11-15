from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ...core.database import Base

if TYPE_CHECKING:
    from .event import Event


class EventException(Base):
    __tablename__ = "event_exceptions"
    __table_args__ = (
        Index("ix_event_exceptions_event_id", "event_id"),
        UniqueConstraint(
            "event_id",
            "original_start_at",
            name="uq_event_exceptions_event_original_start_at",
        ),
        UniqueConstraint(
            "event_id",
            "original_start_date",
            name="uq_event_exceptions_event_original_start_date",
        ),
        CheckConstraint(
            "(original_start_at IS NOT NULL AND original_start_date IS NULL) OR "
            "(original_start_at IS NULL AND original_start_date IS NOT NULL)",
            name="ck_event_exceptions_original_identifier",
        ),
        CheckConstraint(
            "("
            "  (start_at IS NULL AND end_at IS NULL AND start_date IS NULL AND end_date IS NULL)"
            "  OR "
            "  (start_at IS NOT NULL AND end_at IS NOT NULL AND start_date IS NULL AND end_date IS NULL AND end_at > start_at)"
            "  OR "
            "  (start_date IS NOT NULL AND end_date IS NOT NULL AND start_at IS NULL AND end_at IS NULL AND end_date > start_date)"
            ")",
            name="ck_event_exceptions_override_time",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), nullable=False
    )
    original_start_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    original_start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_cancelled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    title: Mapped[str | None] = mapped_column(String, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(String, nullable=True)
    start_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    event: Mapped["Event"] = relationship("Event", back_populates="exceptions")
