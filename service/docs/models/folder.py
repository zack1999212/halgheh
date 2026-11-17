from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ...core.database import Base


class Folder(Base):
    """A folder inside a workspace, optionally nested under a parent folder.

    Deleting a folder hard-deletes its subfolder tree (CASCADE on
    ``parent_id``); documents that were inside it are NOT deleted — their
    ``folder_id`` falls back to NULL (workspace root), see ``document.py``.
    """

    __tablename__ = "folders"
    __table_args__ = (
        Index("ix_folders_workspace_id", "workspace_id"),
        Index("ix_folders_workspace_parent", "workspace_id", "parent_id"),
        # Caveat: Postgres treats NULL parent_id values as distinct, so this
        # constraint alone cannot reject two root folders with the same name
        # in one workspace. Migration 009 adds two partial unique indexes
        # (one for parent_id IS NOT NULL, one for parent_id IS NULL) as the
        # authoritative NULL-safe enforcement.
        Index(
            "uq_folders_workspace_parent_name",
            "workspace_id",
            "parent_id",
            "name",
            unique=True,
        ),
        # NULL-safe complement: root folders (parent_id IS NULL) are compared
        # as distinct by the constraint above, so a partial unique index
        # covers them.
        Index(
            "uq_folders_root_name",
            "workspace_id",
            "name",
            unique=True,
            postgresql_where=text("parent_id IS NULL"),
        ),
        CheckConstraint(
            "char_length(name) > 0", name="ck_folders_name_not_empty"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("folders.id", ondelete="CASCADE"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    workspace: Mapped["Workspace"] = relationship(back_populates="folders")
    parent: Mapped["Folder | None"] = relationship(
        "Folder",
        back_populates="children",
        remote_side=[id],  # self-referential: id points at Folder.id
    )
    children: Mapped[list["Folder"]] = relationship(
        back_populates="parent",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    documents: Mapped[list["Document"]] = relationship(
        back_populates="folder",
    )
