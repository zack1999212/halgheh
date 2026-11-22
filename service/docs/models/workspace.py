from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
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
    from .document import Document
    from .folder import Folder
    from .tag import Tag

WORKSPACE_TYPES = ("personal", "shared")
PERSONAL_WORKSPACE = "personal"
SHARED_WORKSPACE = "shared"


class Workspace(Base):
    """Canonical workspace entity.

    A workspace is either:
    - ``personal``: one private workspace per user, created automatically
      during registration. Only the owner can access it.
    - ``shared``: a collaborative workspace owned by a user. Access is
      granted to accepted members through workspace membership records.

    Existing document-management workspaces are personal workspaces. Existing
    projects are represented as shared workspaces through the project domain's
    compatibility link.
    """

    __tablename__ = "workspaces"
    __table_args__ = (
        Index("ix_workspaces_owner_id", "owner_id"),
        Index("ix_workspaces_workspace_type", "workspace_type"),
        CheckConstraint(
            "char_length(name) > 0", name="ck_workspaces_name_not_empty"
        ),
        CheckConstraint(
            "workspace_type IN ('personal', 'shared')",
            name="ck_workspaces_workspace_type",
        ),
        Index(
            "uq_workspaces_personal_owner",
            "owner_id",
            unique=True,
            postgresql_where=text("workspace_type = 'personal'"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    workspace_type: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default=PERSONAL_WORKSPACE,
        server_default=text("'personal'"),
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

    # One-directional link to the auth module's User: service/auth/models.py
    # stays untouched, so there is no back_populates on the User side.
    owner: Mapped["User"] = relationship("User")

    folders: Mapped[list["Folder"]] = relationship(
        back_populates="workspace",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    documents: Mapped[list["Document"]] = relationship(
        back_populates="workspace",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    tags: Mapped[list["Tag"]] = relationship(
        back_populates="workspace",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
