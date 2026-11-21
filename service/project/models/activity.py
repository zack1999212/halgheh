"""Project-scoped activity feed model.

Activity records are immutable audit events. They survive deletion of related
domain entities (tasks, documents, calendar events, milestones, members) by
storing snapshots in ``metadata`` and keeping ``entity_id`` nullable without
cascading deletes from those entities.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ...core.database import Base

if TYPE_CHECKING:
    from ...auth.models import User
    from .project import Project


class ProjectActivity(Base):
    __tablename__ = "project_activities"
    __table_args__ = (
        Index(
            "ix_project_activities_project_created_id",
            "project_id",
            "created_at",
            "id",
        ),
        Index("ix_project_activities_project_id", "project_id"),
        Index("ix_project_activities_actor_id", "actor_id"),
        Index("ix_project_activities_event_type", "event_type"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    actor_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    metadata_: Mapped[dict[str, Any] | None] = mapped_column(
        "metadata", JSON, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    project: Mapped["Project"] = relationship("Project")
    actor: Mapped["User | None"] = relationship("User")
