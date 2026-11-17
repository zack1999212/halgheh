from datetime import datetime
from typing import TYPE_CHECKING

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

if TYPE_CHECKING:
    from ...auth.models import User
    from .document import Document

PERMISSION_VIEWER = "viewer"
PERMISSION_EDITOR = "editor"


class DocumentPermission(Base):
    """An access grant for a single user on a single document.

    The owner holds implicit full control via ``documents.owner_id`` and has
    no row in this table; rows here are extra grants to other users.
    ``permission_level`` is viewer or editor (constants above). One grant per
    (document, user); deleting either side removes the grant.
    """

    __tablename__ = "document_permissions"
    __table_args__ = (
        Index("ix_document_permissions_user_id", "user_id"),
        UniqueConstraint(
            "document_id",
            "user_id",
            name="uq_document_permissions_document_user",
        ),
        CheckConstraint(
            "permission_level IN ('viewer', 'editor')",
            name="ck_document_permissions_level",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    permission_level: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    document: Mapped["Document"] = relationship(back_populates="permissions")
    user: Mapped["User"] = relationship("User")
