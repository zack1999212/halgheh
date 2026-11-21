from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..core.database import Base

if TYPE_CHECKING:
    from ..auth.models import User
    from ..project.models import Project


DISCUSSION_TYPES = ("announcement", "discussion")


class ProjectDiscussion(Base):
    __tablename__ = "project_discussions"
    __table_args__ = (
        CheckConstraint(
            "type IN ('announcement', 'discussion')",
            name="ck_project_discussions_type",
        ),
        CheckConstraint("length(btrim(title)) > 0", name="ck_project_discussions_title_not_empty"),
        CheckConstraint("length(btrim(content)) > 0", name="ck_project_discussions_content_not_empty"),
        Index("ix_project_discussions_project_id", "project_id"),
        Index("ix_project_discussions_author_id", "author_id"),
        Index("ix_project_discussions_project_pinned_created", "project_id", "is_pinned", "created_at", "id"),
        Index("ix_project_discussions_project_type", "project_id", "type"),
        Index("ix_project_discussions_deleted_at", "deleted_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    author_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    type: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_pinned: Mapped[bool] = mapped_column(
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
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    project: Mapped["Project"] = relationship("Project")
    author: Mapped["User"] = relationship("User")
    replies: Mapped[list["ProjectDiscussionReply"]] = relationship(
        "ProjectDiscussionReply",
        back_populates="discussion",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    reactions: Mapped[list["ProjectDiscussionReaction"]] = relationship(
        "ProjectDiscussionReaction",
        back_populates="discussion",
        cascade="all, delete-orphan",
        passive_deletes=True,
        foreign_keys="ProjectDiscussionReaction.discussion_id",
    )


class ProjectDiscussionReply(Base):
    __tablename__ = "project_discussion_replies"
    __table_args__ = (
        CheckConstraint("length(btrim(content)) > 0", name="ck_project_discussion_replies_content_not_empty"),
        Index("ix_project_discussion_replies_discussion_id", "discussion_id"),
        Index("ix_project_discussion_replies_author_id", "author_id"),
        Index("ix_project_discussion_replies_discussion_created", "discussion_id", "created_at", "id"),
        Index("ix_project_discussion_replies_deleted_at", "deleted_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    discussion_id: Mapped[int] = mapped_column(
        ForeignKey("project_discussions.id", ondelete="CASCADE"), nullable=False
    )
    author_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    discussion: Mapped["ProjectDiscussion"] = relationship("ProjectDiscussion", back_populates="replies")
    author: Mapped["User"] = relationship("User")
    reactions: Mapped[list["ProjectDiscussionReaction"]] = relationship(
        "ProjectDiscussionReaction",
        back_populates="reply",
        cascade="all, delete-orphan",
        passive_deletes=True,
        foreign_keys="ProjectDiscussionReaction.reply_id",
    )


class ProjectDiscussionReaction(Base):
    __tablename__ = "project_discussion_reactions"
    __table_args__ = (
        CheckConstraint(
            "(discussion_id IS NOT NULL AND reply_id IS NULL) OR "
            "(discussion_id IS NULL AND reply_id IS NOT NULL)",
            name="ck_project_discussion_reactions_target",
        ),
        CheckConstraint("length(btrim(emoji)) > 0", name="ck_project_discussion_reactions_emoji_not_empty"),
        Index("ix_project_discussion_reactions_discussion_id", "discussion_id"),
        Index("ix_project_discussion_reactions_reply_id", "reply_id"),
        Index("ix_project_discussion_reactions_user_id", "user_id"),
        Index(
            "uq_project_discussion_reactions_discussion_user_emoji",
            "discussion_id",
            "user_id",
            "emoji",
            unique=True,
            postgresql_where=text("discussion_id IS NOT NULL"),
        ),
        Index(
            "uq_project_discussion_reactions_reply_user_emoji",
            "reply_id",
            "user_id",
            "emoji",
            unique=True,
            postgresql_where=text("reply_id IS NOT NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    discussion_id: Mapped[int | None] = mapped_column(
        ForeignKey("project_discussions.id", ondelete="CASCADE"), nullable=True
    )
    reply_id: Mapped[int | None] = mapped_column(
        ForeignKey("project_discussion_replies.id", ondelete="CASCADE"), nullable=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    emoji: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    discussion: Mapped["ProjectDiscussion | None"] = relationship(
        "ProjectDiscussion", back_populates="reactions", foreign_keys=[discussion_id]
    )
    reply: Mapped["ProjectDiscussionReply | None"] = relationship(
        "ProjectDiscussionReply", back_populates="reactions", foreign_keys=[reply_id]
    )
    user: Mapped["User"] = relationship("User")
