from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ...core.database import Base

if TYPE_CHECKING:
    from ...auth.models import User
    from .document_favorite import DocumentFavorite
    from .document_link import DocumentLink
    from .document_permission import DocumentPermission
    from .document_tag import DocumentTag
    from .document_version import DocumentVersion
    from .folder import Folder
    from .tag import Tag
    from .workspace import Workspace


class Document(Base):
    """A Markdown document in a workspace.

    Lifecycle flags (all soft states — hard deletes only happen through
    database-level cascades):
    - ``is_deleted``: moved to trash; excluded from default listings and
      restorable.
    - ``is_archived``: parked, still visible in archive views.
    - ``is_favorite``: denormalized convenience flag for the *owner*, kept in
      sync with ``document_favorites`` by the service layer; the per-user
      source of truth is the ``document_favorites`` table.

    ``slug`` is unique per workspace; generation lives in the service layer.
    ``content`` holds the current Markdown body; every change is snapshotted
    into ``document_versions`` by the service layer.
    """

    __tablename__ = "documents"
    __table_args__ = (
        Index("ix_documents_workspace_folder", "workspace_id", "folder_id"),
        Index("ix_documents_owner_id", "owner_id"),
        Index("ix_documents_workspace_archived", "workspace_id", "is_archived"),
        UniqueConstraint(
            "workspace_id", "slug", name="uq_documents_workspace_slug"
        ),
        CheckConstraint(
            "char_length(title) > 0", name="ck_documents_title_not_empty"
        ),
        CheckConstraint(
            "char_length(slug) > 0", name="ck_documents_slug_not_empty"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    folder_id: Mapped[int | None] = mapped_column(
        # SET NULL: hard-deleting a folder moves its documents to the
        # workspace root instead of destroying them.
        ForeignKey("folders.id", ondelete="SET NULL"),
        nullable=True,
    )
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    slug: Mapped[str] = mapped_column(String(255), nullable=False)
    icon: Mapped[str | None] = mapped_column(String(32), nullable=True)
    is_favorite: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    is_archived: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    is_deleted: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
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

    workspace: Mapped["Workspace"] = relationship(back_populates="documents")
    folder: Mapped["Folder | None"] = relationship(back_populates="documents")
    owner: Mapped["User"] = relationship("User")

    versions: Mapped[list["DocumentVersion"]] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="DocumentVersion.version_number.desc()",
    )
    # Read-only convenience over the association table; writes go through
    # DocumentTag (SQLAlchemy 2.0 association-object pattern).
    tags: Mapped[list["Tag"]] = relationship(
        secondary="document_tags", viewonly=True
    )
    document_tags: Mapped[list["DocumentTag"]] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    # Two FKs to documents, so each side needs explicit foreign_keys.
    links_out: Mapped[list["DocumentLink"]] = relationship(
        foreign_keys="DocumentLink.source_document_id",
        cascade="all, delete-orphan",
        passive_deletes=True,
        overlaps="source",
    )
    links_in: Mapped[list["DocumentLink"]] = relationship(
        foreign_keys="DocumentLink.target_document_id",
        cascade="all, delete-orphan",
        passive_deletes=True,
        overlaps="target",
    )
    favorites: Mapped[list["DocumentFavorite"]] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    permissions: Mapped[list["DocumentPermission"]] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
