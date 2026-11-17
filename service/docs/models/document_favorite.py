from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ...core.database import Base

if TYPE_CHECKING:
    from ...auth.models import User
    from .document import Document


class DocumentFavorite(Base):
    """Per-user favorite marker on a document (one row per user/document).

    This table is the per-user source of truth for favorites.
    ``documents.is_favorite`` is the owner's denormalized copy, maintained by
    the service layer for cheap default listings. Deleting the user or the
    document removes the marker.
    """

    __tablename__ = "document_favorites"
    __table_args__ = (
        Index("ix_document_favorites_user_id", "user_id"),
        UniqueConstraint(
            "user_id",
            "document_id",
            name="uq_document_favorites_user_document",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    document_id: Mapped[int] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    user: Mapped["User"] = relationship("User")
    document: Mapped["Document"] = relationship(back_populates="favorites")
