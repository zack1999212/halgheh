from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ...core.database import Base

if TYPE_CHECKING:
    from ...auth.models import User
    from .document import Document


class DocumentVersion(Base):
    """An immutable snapshot of a document at a point in time.

    Rows are never updated or deleted by the application; the service layer
    appends a new row (next ``version_number``) whenever document content or
    title changes. Version 1 is created together with the document. The
    ``created_by`` user id becomes NULL (SET NULL, not CASCADE) if the editor
    is deleted, so the snapshot itself always survives.
    """

    __tablename__ = "document_versions"
    __table_args__ = (
        Index("ix_document_versions_document_id", "document_id"),
        UniqueConstraint(
            "document_id",
            "version_number",
            name="uq_document_versions_document_version",
        ),
        CheckConstraint(
            "version_number >= 1",
            name="ck_document_versions_version_number_positive",
        ),
        CheckConstraint(
            "char_length(title) > 0",
            name="ck_document_versions_title_not_empty",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    version_number: Mapped[int] = mapped_column(nullable=False)
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    document: Mapped["Document"] = relationship(back_populates="versions")
    creator: Mapped["User | None"] = relationship("User")
