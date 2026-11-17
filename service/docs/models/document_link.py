from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ...core.database import Base

# Stable identifiers, like events.category: display labels live in the
# frontend mapping, never in the database.
LINK_TYPE_RELATED = "related"
LINK_TYPE_REFERENCE = "reference"
LINK_TYPE_DEPENDS_ON = "depends_on"


class DocumentLink(Base):
    """A typed link between two documents (source → target).

    Uniqueness of (source, target, link_type) prevents duplicate links, and a
    check constraint forbids self-links. Deleting either side of the link
    (hard delete) removes the link row.
    """

    __tablename__ = "document_links"
    __table_args__ = (
        UniqueConstraint(
            "source_document_id",
            "target_document_id",
            "link_type",
            name="uq_document_links_source_target_type",
        ),
        CheckConstraint(
            "source_document_id <> target_document_id",
            name="ck_document_links_not_self",
        ),
        CheckConstraint(
            "link_type IN ('related', 'reference', 'depends_on')",
            name="ck_document_links_link_type",
        ),
        Index("ix_document_links_target_document_id", "target_document_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    source_document_id: Mapped[int] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    target_document_id: Mapped[int] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    link_type: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Explicit foreign_keys on both sides because DocumentLink has two FKs
    # to documents. overlaps= acknowledges that these are parallel
    # one-directional views of the same FK columns as Document.links_out /
    # Document.links_in (no back_populates is intended between them).
    source: Mapped["Document"] = relationship(
        foreign_keys=[source_document_id],
        overlaps="links_out",
    )
    target: Mapped["Document"] = relationship(
        foreign_keys=[target_document_id],
        overlaps="links_in",
    )
