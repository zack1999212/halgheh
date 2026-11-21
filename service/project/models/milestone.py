from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ...core.database import Base

# Stable status identifiers stored in the database; display labels and colors
# are frontend concerns (same rule as task statuses).
MILESTONE_STATUSES = ("pending", "in_progress", "completed", "cancelled")
COMPLETED_STATUS = "completed"


class ProjectMilestone(Base):
    """A goal belonging to exactly one project.

    Milestones are independent records: they are not tasks, they carry no task
    relationship, and their progress/completion status is derived from their
    dedicated milestone steps (not from tasks). Access is always derived from
    project membership/role, never from ``created_by``.

    ``completed_at`` is maintained by the service layer and kept consistent
    with ``status`` (completed milestones have a completion timestamp; others do
    not). Deleting a project removes its milestones and their steps
    (``ondelete="CASCADE"``), matching existing project deletion conventions.
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
        CheckConstraint("position >= 0", name="ck_project_milestones_position_nonneg"),
        Index("ix_project_milestones_project_id", "project_id"),
        Index("ix_project_milestones_project_due_date", "project_id", "due_date"),
        Index("ix_project_milestones_project_position", "project_id", "position"),
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
    position: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
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

    steps: Mapped[list["ProjectMilestoneStep"]] = relationship(
        "ProjectMilestoneStep",
        back_populates="milestone",
        cascade="all, delete-orphan",
        order_by="ProjectMilestoneStep.position.asc(), ProjectMilestoneStep.id.asc()",
    )


class ProjectMilestoneStep(Base):
    """An ordered stage required to achieve a milestone.

    Steps are independent records (never regular Tasks). Progress and milestone
    completion are derived from steps by the backend service layer.
    """

    __tablename__ = "project_milestone_steps"
    __table_args__ = (
        CheckConstraint("length(title) > 0", name="ck_project_milestone_steps_title_not_empty"),
        CheckConstraint("position >= 0", name="ck_project_milestone_steps_position_nonneg"),
        CheckConstraint(
            "(is_completed = TRUE AND completed_at IS NOT NULL) OR "
            "(is_completed = FALSE AND completed_at IS NULL)",
            name="ck_project_milestone_steps_completed_state",
        ),
        Index("ix_project_milestone_steps_milestone_id", "milestone_id"),
        Index("ix_project_milestone_steps_milestone_position", "milestone_id", "position"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    milestone_id: Mapped[int] = mapped_column(
        ForeignKey("project_milestones.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    position: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )
    is_completed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
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

    milestone: Mapped["ProjectMilestone"] = relationship(
        "ProjectMilestone", back_populates="steps"
    )
