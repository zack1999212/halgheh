from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ...core.database import Base

if TYPE_CHECKING:
    from ...auth.models import User
    from .task import Task

# Stable assignment lifecycle values. "cancelled" keeps the row as history
# instead of deleting it, so re-assignment churn does not lose the trail.
ASSIGNMENT_STATUSES = ("active", "cancelled")


class TaskAssignment(Base):
    """A user assigned to a task.

    ``assigned_user_id`` is the assignee; ``assigned_by`` is the user who
    performed the assignment (currently the task creator, kept as its own
    column so a future delegation feature needs no schema change). The
    composite unique index makes an assignment idempotent: the same user
    cannot be attached to the same task twice.
    """

    __tablename__ = "task_assignments"
    __table_args__ = (
        CheckConstraint(
            "assignment_status IN ('active', 'cancelled')",
            name="ck_task_assignments_status",
        ),
        Index(
            "uq_task_assignments_task_user",
            "task_id",
            "assigned_user_id",
            unique=True,
        ),
        Index("ix_task_assignments_task_id", "task_id"),
        Index("ix_task_assignments_assigned_user_id", "assigned_user_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False
    )
    assigned_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    assigned_by: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    assignment_status: Mapped[str] = mapped_column(
        String, nullable=False, default="active", server_default=text("'active'")
    )
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    task: Mapped["Task"] = relationship("Task", back_populates="assignments")
    # Two foreign keys target users, so each relationship pins its column.
    assigned_user: Mapped["User"] = relationship(
        "User", foreign_keys=[assigned_user_id]
    )
    assigned_by_user: Mapped["User"] = relationship("User", foreign_keys=[assigned_by])
