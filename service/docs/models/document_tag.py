from sqlalchemy import ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ...core.database import Base


class DocumentTag(Base):
    """Association between a document and a tag.

    The composite primary key (document_id, tag_id) makes duplicate
    document-tag pairs impossible at the database level; no surrogate id is
    used. Rows are removed automatically when either side is hard-deleted.
    """

    __tablename__ = "document_tags"
    __table_args__ = (
        # Secondary lookup direction: "which documents carry this tag".
        Index("ix_document_tags_tag_id", "tag_id"),
    )

    document_id: Mapped[int] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True
    )
    tag_id: Mapped[int] = mapped_column(
        ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True
    )

    document: Mapped["Document"] = relationship(
        back_populates="document_tags"
    )
    tag: Mapped["Tag"] = relationship(back_populates="document_tags")
