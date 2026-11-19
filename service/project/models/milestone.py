from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
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
from sqlalchemy.orm import Mapped, mapped_column

from ...core.database import Base

# Stable status identifiers stored in the database; display labels and colors
# are frontend concerns (same rule as task statuses).
MILESTONE_STATUSES = ("pending", "in_progress", "completed", "cancelled")
COMPLETED_STATUS = "completed"


class ProjectMilestone(Base):
    """A goal belonging to exactly one project.

    Milestones are independent records: they are not tasks, they carry no task
    relationship, and their status is never derived from task state. Access is
    always derived from project membership/role, never from ``created_by``.

    ``completed_at`` is maintained by the service layer and kept in sync with
    ``status`` by ``ck_project_milestones_completed_state``. Deleting a
    project removes its milestones (``ondelete="CASCADE"``), matching the
    existing project membership/invitation policy: nothing is left orphaned.
    """

    __tablename__ = "project_milestones"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'in_progress', 'completed', 'cancelled')",
            name="ck_project_milestones_status",
        ),
        CheckConstraint(
            "length(title) > 0", name="ck_project_milestones_title_not_empty"
        ),
        CheckConstraint(
            "(status = 'completed' AND completed_at IS NOT NULL) OR "
            "(status != 'completed' AND completed_at IS NULL)",
            name="ck_project_milestones_completed_state",
        ),
        Index("ix_project_milestones_project_id", "project_id"),
        Index("ix_project_milestones_project_due_date", "project_id", "due_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="pending", server_default=text("'pending'")
    )
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_by: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
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
