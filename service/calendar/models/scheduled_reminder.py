from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ...core.database import Base

if TYPE_CHECKING:
    from .event import Event
    from .reminder import Reminder
    from ...notifications.models.notification import Notification


class ScheduledReminder(Base):
    __tablename__ = "scheduled_reminders"
    __table_args__ = (
        Index("ix_scheduled_reminders_reminder_id", "reminder_id"),
        Index("ix_scheduled_reminders_event_id", "event_id"),
        Index("ix_scheduled_reminders_status_scheduled_at", "status", "scheduled_at"),
        Index(
            "ix_scheduled_reminders_due",
            "scheduled_at",
            postgresql_where=text("status = 'pending'"),
        ),
        Index(
            "uq_scheduled_reminders_timed",
            "reminder_id",
            "occurrence_start_at",
            unique=True,
            postgresql_where=text("occurrence_start_at IS NOT NULL"),
        ),
        Index(
            "uq_scheduled_reminders_allday",
            "reminder_id",
            "occurrence_start_date",
            unique=True,
            postgresql_where=text("occurrence_start_date IS NOT NULL"),
        ),
        CheckConstraint(
            "status IN ('pending', 'processed', 'cancelled', 'skipped')",
            name="ck_scheduled_reminders_status",
        ),
        CheckConstraint(
            "(occurrence_start_at IS NOT NULL) <> (occurrence_start_date IS NOT NULL)",
            name="ck_scheduled_reminders_occurrence_identity",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    reminder_id: Mapped[int] = mapped_column(
        ForeignKey("reminders.id", ondelete="CASCADE"), nullable=False
    )
    event_id: Mapped[int] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), nullable=False
    )
    occurrence_start_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    occurrence_start_date: Mapped[date | None] = mapped_column(
        Date, nullable=True
    )
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending", server_default=text("'pending'"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    reminder: Mapped["Reminder"] = relationship("Reminder", back_populates="scheduled_reminders")
    event: Mapped["Event"] = relationship("Event", back_populates="scheduled_reminders")
    notification: Mapped["Notification | None"] = relationship(
        "Notification", back_populates="scheduled_reminder", uselist=False
    )
