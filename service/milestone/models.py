from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..core.database import Base
from ..task.models import Task

# Statuses are derived from a milestone's steps (which in turn are derived
# from their attached tasks). Clients never write these values directly.
MILESTONE_STATUSES = ("pending", "in_progress", "completed")


class Milestone(Base):
    """A roadmap belonging to exactly one workspace.

    Only the workspace owner may create or change a milestone. Progress and
    status are derived from steps, and step completion is derived from the
    tasks attached to that step — neither is stored as an editable field.
    """

    __tablename__ = "milestones"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'in_progress', 'completed')",
            name="ck_milestones_status",
        ),
        CheckConstraint("length(title) > 0", name="ck_milestones_title_not_empty"),
        CheckConstraint(
            "(status = 'completed' AND completed_at IS NOT NULL) OR "
            "(status != 'completed' AND completed_at IS NULL)",
            name="ck_milestones_completed_state",
        ),
        CheckConstraint("position >= 0", name="ck_milestones_position_nonneg"),
        Index("ix_milestones_workspace_id", "workspace_id"),
        Index("ix_milestones_workspace_due_date", "workspace_id", "due_date"),
        Index("ix_milestones_workspace_position", "workspace_id", "position"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
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

    steps: Mapped[list["MilestoneStep"]] = relationship(
        "MilestoneStep",
        back_populates="milestone",
        cascade="all, delete-orphan",
        order_by="MilestoneStep.position.asc(), MilestoneStep.id.asc()",
    )


class MilestoneStep(Base):
    """An ordered stage of a milestone.

    A step is complete once *all* of its attached tasks have status ``done``.
    A step without tasks is not complete.
    """

    __tablename__ = "milestone_steps"
    __table_args__ = (
        CheckConstraint("length(title) > 0", name="ck_milestone_steps_title_not_empty"),
        CheckConstraint("position >= 0", name="ck_milestone_steps_position_nonneg"),
        Index("ix_milestone_steps_milestone_id", "milestone_id"),
        Index("ix_milestone_steps_milestone_position", "milestone_id", "position"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    milestone_id: Mapped[int] = mapped_column(
        ForeignKey("milestones.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    position: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
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

    milestone: Mapped["Milestone"] = relationship("Milestone", back_populates="steps")
    task_links: Mapped[list["MilestoneStepTask"]] = relationship(
        "MilestoneStepTask",
        back_populates="step",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class MilestoneStepTask(Base):
    """Links a task to a milestone step.

    A task may be attached to several steps; deleting the step or the task
    only removes the link, never the task itself.
    """

    __tablename__ = "milestone_step_tasks"
    __table_args__ = (
        UniqueConstraint("step_id", "task_id", name="uq_milestone_step_tasks_step_task"),
        Index("ix_milestone_step_tasks_step_id", "step_id"),
        Index("ix_milestone_step_tasks_task_id", "task_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    step_id: Mapped[int] = mapped_column(
        ForeignKey("milestone_steps.id", ondelete="CASCADE"), nullable=False
    )
    task_id: Mapped[int] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False
    )

    step: Mapped["MilestoneStep"] = relationship("MilestoneStep", back_populates="task_links")
    task: Mapped["Task"] = relationship("Task")
