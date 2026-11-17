from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ...core.database import Base

if TYPE_CHECKING:
    from ...auth.models import User
    from .task import Task


class TaskComment(Base):
    """A free-text comment on a task.

    Structurally mirrors ``CalendarEventComment`` (same columns, same index
    shape) so behavior is predictable and review is trivial. Comments belong
    to their task and their author; both cascade on deletion, matching the
    event-comments precedent.
    """

    __tablename__ = "task_comments"
    __table_args__ = (
        Index("ix_task_comments_task_id", "task_id"),
        Index("ix_task_comments_task_created", "task_id", "created_at", "id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    task: Mapped["Task"] = relationship("Task", back_populates="comments")
    user: Mapped["User"] = relationship("User")
