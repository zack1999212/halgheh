from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ...core.database import Base

if TYPE_CHECKING:
    from ...auth.models import User
    from .task import Task

# Audit vocabulary. Deliberately an open set stored as a plain string (no
# check constraint) so new actions can be introduced without a migration;
# the service layer validates the values it writes.
ACTIVITY_ACTIONS = (
    "task_created",
    "task_updated",
    "task_deleted",
    "status_changed",
    "priority_changed",
    "due_date_changed",
    "assignee_added",
    "assignee_removed",
    "label_added",
    "label_removed",
    "comment_added",
    "comment_deleted",
)


class TaskActivity(Base):
    """An immutable audit-trail entry for a task.

    Activity records are history: they must survive the deletion of the task
    they describe. Both foreign keys therefore use ``ondelete="SET NULL"`` —
    when a task or an actor is removed the row remains with the reference
    cleared. ``old_value``/``new_value`` store serialized snapshots of the
    changed field (JSON-encoded strings written by the service layer).
    """

    __tablename__ = "task_activities"
    __table_args__ = (
        Index("ix_task_activities_task_created", "task_id", "created_at", "id"),
        Index("ix_task_activities_actor_id", "actor_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # Nullable by design: cleared (not deleted) when the referenced row is
    # removed, preserving the historical record.
    task_id: Mapped[int | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True
    )
    actor_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    old_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Plain many-to-one references with no ORM delete cascades in either
    # direction: nothing that deletes a Task or a User may touch these rows
    # through the session — the database SET NULL rule is the only effect.
    task: Mapped["Task | None"] = relationship("Task")
    actor: Mapped["User | None"] = relationship("User")
