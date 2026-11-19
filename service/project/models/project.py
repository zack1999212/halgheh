from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ...core.database import Base

if TYPE_CHECKING:
    from ...auth.models import User

PROJECT_STATUSES = ("active", "on_hold", "completed", "archived")


class Project(Base):
    """A project owned by its creator.

    ``owner_id`` is the single ownership key used by Phase 1 access checks.
    The creator is always the initial owner. Future project membership will be
    introduced separately without changing the meaning of ``owner_id``.
    """

    __tablename__ = "projects"
    __table_args__ = (
        CheckConstraint(
            "status IN ('active', 'on_hold', 'completed', 'archived')",
            name="ck_projects_status",
        ),
        CheckConstraint("length(name) > 0", name="ck_projects_name_not_empty"),
        CheckConstraint(
            "start_date IS NULL OR target_date IS NULL OR start_date <= target_date",
            name="ck_projects_date_order",
        ),
        CheckConstraint(
            "(status = 'archived' AND archived_at IS NOT NULL) OR "
            "(status != 'archived' AND archived_at IS NULL)",
            name="ck_projects_archived_state",
        ),
        Index("ix_projects_owner_id", "owner_id"),
        Index("ix_projects_status", "status"),
        Index("ix_projects_owner_id_status", "owner_id", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="active", server_default=text("'active'")
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    target_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    color: Mapped[str | None] = mapped_column(String(32), nullable=True)
    icon: Mapped[str | None] = mapped_column(String(64), nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(
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

    owner: Mapped["User"] = relationship("User")
