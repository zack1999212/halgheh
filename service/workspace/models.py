from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, UniqueConstraint, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..core.database import Base

if TYPE_CHECKING:
    from ..auth.models import User
    from ..docs.models import Workspace

WORKSPACE_MEMBER_ROLES = ("admin", "editor", "viewer")
WORKSPACE_INVITATION_STATUSES = ("pending", "accepted", "declined", "revoked", "expired")
WORKSPACE_INVITABLE_ROLES = ("admin", "editor", "viewer")


class WorkspaceMember(Base):
    """Accepted membership in a shared workspace.

    The workspace owner is represented by ``workspaces.owner_id`` and must not
    be duplicated here. Personal workspaces cannot have members.
    """

    __tablename__ = "workspace_members"
    __table_args__ = (
        UniqueConstraint("workspace_id", "user_id", name="uq_workspace_members_workspace_user"),
        CheckConstraint(
            "role IN ('admin', 'editor', 'viewer')",
            name="ck_workspace_members_role",
        ),
        Index("ix_workspace_members_workspace_id", "workspace_id"),
        Index("ix_workspace_members_user_id", "user_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
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

    workspace: Mapped["Workspace"] = relationship("Workspace")
    user: Mapped["User"] = relationship("User")


class WorkspaceInvitation(Base):
    """Canonical invitation for an existing user to join a shared workspace."""

    __tablename__ = "workspace_invitations"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'accepted', 'declined', 'revoked', 'expired')",
            name="ck_workspace_invitations_status",
        ),
        CheckConstraint(
            "role IN ('admin', 'editor', 'viewer')",
            name="ck_workspace_invitations_role",
        ),
        Index("ix_workspace_invitations_workspace_id", "workspace_id"),
        Index("ix_workspace_invitations_inviter_id", "inviter_id"),
        Index("ix_workspace_invitations_invitee_id", "invitee_id"),
        Index("ix_workspace_invitations_status", "status"),
        Index(
            "uq_workspace_invitations_pending_workspace_invitee",
            "workspace_id",
            "invitee_id",
            unique=True,
            postgresql_where=text("status = 'pending'"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    inviter_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    invitee_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    invitee_username: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="pending", server_default=text("'pending'")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    responded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    workspace: Mapped["Workspace"] = relationship("Workspace")
    inviter: Mapped["User"] = relationship("User", foreign_keys=[inviter_id])
    invitee: Mapped["User"] = relationship("User", foreign_keys=[invitee_id])


class TaskWorkspace(Base):
    """Canonical association between a Task and a Workspace."""

    __tablename__ = "task_workspaces"
    __table_args__ = (
        Index("ix_task_workspaces_workspace_id", "workspace_id"),
        Index("ix_task_workspaces_task_id", "task_id"),
    )

    task_id: Mapped[int] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True
    )
    workspace_id: Mapped[int] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class DocumentWorkspace(Base):
    """Canonical association between a Document and a Workspace."""

    __tablename__ = "document_workspaces"
    __table_args__ = (
        Index("ix_document_workspaces_workspace_id", "workspace_id"),
        Index("ix_document_workspaces_document_id", "document_id"),
    )

    document_id: Mapped[int] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True
    )
    workspace_id: Mapped[int] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class EventWorkspace(Base):
    """Canonical association between a CalendarEvent and a Workspace."""

    __tablename__ = "event_workspaces"
    __table_args__ = (
        Index("ix_event_workspaces_workspace_id", "workspace_id"),
        Index("ix_event_workspaces_event_id", "event_id"),
    )

    event_id: Mapped[int] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), primary_key=True
    )
    workspace_id: Mapped[int] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
