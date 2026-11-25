from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
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
    from ...auth.models import User
    from ...project.models import Project
    from .assignment import TaskAssignment
    from .checklist import TaskChecklistItem
    from .comment import TaskComment
    from .label import TaskLabelAssignment

# Stable status/priority identifiers stored in the database; display labels
# and colors are frontend concerns (same rule as calendar event categories).
TASK_STATUSES = ("todo", "in_progress", "blocked", "done", "cancelled")
TASK_PRIORITIES = ("low", "medium", "high", "urgent")
DONE_STATUS = "done"


class Task(Base):
    """A task owned by its creator.

    ``created_by`` is the single ownership key used by every service-layer
    permission check. ``parent_task_id`` enables subtasks through a
    self-referencing foreign key; hierarchy cycles are prevented in the
    service layer, while the database only forbids the trivial self-parent
    case. Deleting a parent task promotes its children to top-level tasks
    (``ondelete="SET NULL"``) so no work is silently destroyed.
    """

    __tablename__ = "tasks"
    __table_args__ = (
        CheckConstraint(
            "status IN ('todo', 'in_progress', 'blocked', 'done', 'cancelled')",
            name="ck_tasks_status",
        ),
        CheckConstraint(
            "priority IN ('low', 'medium', 'high', 'urgent')",
            name="ck_tasks_priority",
        ),
        CheckConstraint("length(title) > 0", name="ck_tasks_title_not_empty"),
        CheckConstraint(
            "(status = 'done' AND completed_at IS NOT NULL) OR "
            "(status != 'done' AND completed_at IS NULL)",
            name="ck_tasks_completed_state",
        ),
        CheckConstraint(
            "start_date IS NULL OR due_date IS NULL OR due_date >= start_date",
            name="ck_tasks_date_order",
        ),
        CheckConstraint(
            "parent_task_id IS NULL OR parent_task_id != id",
            name="ck_tasks_parent_not_self",
        ),
        Index("ix_tasks_created_by", "created_by"),
        Index("ix_tasks_created_by_status", "created_by", "status"),
        Index("ix_tasks_due_date", "due_date"),
        Index("ix_tasks_parent_task_id", "parent_task_id"),
        Index("ix_tasks_project_id", "project_id"),
        Index("ix_tasks_status_position_id", "status", "position", "id"),
        Index("ix_tasks_priority_position_id", "priority", "priority_position", "id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String, nullable=False, default="todo", server_default=text("'todo'")
    )
    priority: Mapped[str] = mapped_column(
        String, nullable=False, default="medium", server_default=text("'medium'")
    )
    created_by: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"), nullable=True
    )
    parent_task_id: Mapped[int | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True
    )
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    position: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0, server_default=text("0")
    )
    priority_position: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0, server_default=text("0")
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

    creator: Mapped["User"] = relationship("User")
    # Self-referencing subtask hierarchy. ``remote_side`` marks the "one" end;
    # children survive a parent deletion because the FK uses SET NULL, and
    # ``passive_deletes`` lets the database perform that promotion without
    # loading the child rows in Python.
    parent: Mapped["Task | None"] = relationship(
        "Task",
        remote_side=[id],
        back_populates="children",
    )
    children: Mapped[list["Task"]] = relationship(
        "Task",
        back_populates="parent",
        passive_deletes=True,
    )
    assignments: Mapped[list["TaskAssignment"]] = relationship(
        "TaskAssignment",
        back_populates="task",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    comments: Mapped[list["TaskComment"]] = relationship(
        "TaskComment",
        back_populates="task",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    label_assignments: Mapped[list["TaskLabelAssignment"]] = relationship(
        "TaskLabelAssignment",
        back_populates="task",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    checklist_items: Mapped[list["TaskChecklistItem"]] = relationship(
        "TaskChecklistItem",
        back_populates="task",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="TaskChecklistItem.position.asc(), TaskChecklistItem.id.asc()",
    )
    # NOTE: no ``activities`` relationship is declared on purpose. Activity
    # rows are audit history and must survive task deletion (the FK uses
    # ``ondelete="SET NULL"``); an ORM-side relationship with a delete
    # cascade would risk removing them, so the Task side stays unaware.
