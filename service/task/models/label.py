from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ...core.database import Base

if TYPE_CHECKING:
    from ...auth.models import User
    from .task import Task


class TaskLabel(Base):
    """A user-defined label (tag) that can be attached to tasks.

    Labels are private to their creator (``created_by``), matching the
    platform's per-user ownership model. The composite unique index prevents
    a user from defining two labels with the same name while allowing the
    same name across different users.
    """

    __tablename__ = "task_labels"
    __table_args__ = (
        CheckConstraint("char_length(name) > 0", name="ck_task_labels_name_not_empty"),
        CheckConstraint(
            "color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'",
            name="ck_task_labels_color_format",
        ),
        Index("uq_task_labels_creator_name", "created_by", "name", unique=True),
        Index("ix_task_labels_created_by", "created_by"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    # Optional 6-digit hex color ("#RRGGBB"); nullable like Calendar.color.
    color: Mapped[str | None] = mapped_column(String(7), nullable=True)
    created_by: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    creator: Mapped["User"] = relationship("User")
    task_assignments: Mapped[list["TaskLabelAssignment"]] = relationship(
        "TaskLabelAssignment",
        back_populates="label",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class TaskLabelAssignment(Base):
    """The link between a task and one of its creator's labels.

    The composite unique index makes attaching idempotent and prevents the
    same label being associated with a task twice. Deleting either the task
    or the label removes the link (CASCADE), never the other side.
    """

    __tablename__ = "task_label_assignments"
    __table_args__ = (
        Index(
            "uq_task_label_assignments_task_label",
            "task_id",
            "label_id",
            unique=True,
        ),
        Index("ix_task_label_assignments_label_id", "label_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False
    )
    label_id: Mapped[int] = mapped_column(
        ForeignKey("task_labels.id", ondelete="CASCADE"), nullable=False
    )

    task: Mapped["Task"] = relationship("Task", back_populates="label_assignments")
    label: Mapped["TaskLabel"] = relationship(
        "TaskLabel", back_populates="task_assignments"
    )
