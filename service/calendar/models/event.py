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
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ...core.database import Base

if TYPE_CHECKING:
    from .calendar import Calendar
    from .event_exception import EventException


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (
        Index("ix_events_calendar_id", "calendar_id"),
        Index("ix_events_calendar_start_at", "calendar_id", "start_at"),
        Index("ix_events_calendar_start_date", "calendar_id", "start_date"),
        CheckConstraint(
            "(is_all_day = false AND start_at IS NOT NULL AND end_at IS NOT NULL "
            "AND start_date IS NULL AND end_date IS NULL AND end_at > start_at) OR "
            "(is_all_day = true AND start_date IS NOT NULL AND end_date IS NOT NULL "
            "AND start_at IS NULL AND end_at IS NULL AND end_date > start_date)",
            name="ck_events_timed_or_allday",
        ),
        CheckConstraint("char_length(title) > 0", name="ck_events_title_not_empty"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    calendar_id: Mapped[int] = mapped_column(
        ForeignKey("calendars.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(String, nullable=True)
    is_all_day: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    start_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    timezone: Mapped[str | None] = mapped_column(String, nullable=True)
    recurrence_rule: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    calendar: Mapped["Calendar"] = relationship("Calendar", back_populates="events")
    exceptions: Mapped[list["EventException"]] = relationship(
        "EventException",
        back_populates="event",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    reminders: Mapped[list["Reminder"]] = relationship(
        "Reminder",
        back_populates="event",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    scheduled_reminders: Mapped[list["ScheduledReminder"]] = relationship(
        "ScheduledReminder",
        back_populates="event",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    notifications: Mapped[list["Notification"]] = relationship(
        "Notification",
        back_populates="event",
    )
