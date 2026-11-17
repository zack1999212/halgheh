from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ...core.database import Base


class Tag(Base):
    """A colored label scoped to one workspace.

    Tag names are unique within their workspace; the color is stored as a
    six-digit hex string with a database-level format check. Documents link
    to tags through ``document_tags``.
    """

    __tablename__ = "tags"
    __table_args__ = (
        Index("ix_tags_workspace_id", "workspace_id"),
        UniqueConstraint("workspace_id", "name", name="uq_tags_workspace_name"),
        CheckConstraint("char_length(name) > 0", name="ck_tags_name_not_empty"),
        CheckConstraint("color ~ '^#[0-9a-fA-F]{6}$'", name="ck_tags_color_hex"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    color: Mapped[str] = mapped_column(String(7), nullable=False)

    workspace: Mapped["Workspace"] = relationship(back_populates="tags")
    document_tags: Mapped[list["DocumentTag"]] = relationship(
        back_populates="tag",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
