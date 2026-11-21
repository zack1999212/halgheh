"""project discussions

Adds project discussion, reply, and reaction tables.

Revision ID: 027
Revises: 026
Create Date: 2026-11-21 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "027"
down_revision: Union[str, Sequence[str], None] = "026"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "project_discussions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("author_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("type", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("is_pinned", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("type IN ('announcement', 'discussion')", name="ck_project_discussions_type"),
        sa.CheckConstraint("length(btrim(title)) > 0", name="ck_project_discussions_title_not_empty"),
        sa.CheckConstraint("length(btrim(content)) > 0", name="ck_project_discussions_content_not_empty"),
    )
    op.create_index("ix_project_discussions_project_id", "project_discussions", ["project_id"])
    op.create_index("ix_project_discussions_author_id", "project_discussions", ["author_id"])
    op.create_index(
        "ix_project_discussions_project_pinned_created",
        "project_discussions",
        ["project_id", "is_pinned", "created_at", "id"],
    )
    op.create_index("ix_project_discussions_project_type", "project_discussions", ["project_id", "type"])
    op.create_index("ix_project_discussions_deleted_at", "project_discussions", ["deleted_at"])

    op.create_table(
        "project_discussion_replies",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "discussion_id",
            sa.Integer(),
            sa.ForeignKey("project_discussions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("author_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "length(btrim(content)) > 0",
            name="ck_project_discussion_replies_content_not_empty",
        ),
    )
    op.create_index("ix_project_discussion_replies_discussion_id", "project_discussion_replies", ["discussion_id"])
    op.create_index("ix_project_discussion_replies_author_id", "project_discussion_replies", ["author_id"])
    op.create_index(
        "ix_project_discussion_replies_discussion_created",
        "project_discussion_replies",
        ["discussion_id", "created_at", "id"],
    )
    op.create_index("ix_project_discussion_replies_deleted_at", "project_discussion_replies", ["deleted_at"])

    op.create_table(
        "project_discussion_reactions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "discussion_id",
            sa.Integer(),
            sa.ForeignKey("project_discussions.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "reply_id",
            sa.Integer(),
            sa.ForeignKey("project_discussion_replies.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("emoji", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "(discussion_id IS NOT NULL AND reply_id IS NULL) OR "
            "(discussion_id IS NULL AND reply_id IS NOT NULL)",
            name="ck_project_discussion_reactions_target",
        ),
        sa.CheckConstraint(
            "length(btrim(emoji)) > 0",
            name="ck_project_discussion_reactions_emoji_not_empty",
        ),
    )
    op.create_index(
        "ix_project_discussion_reactions_discussion_id",
        "project_discussion_reactions",
        ["discussion_id"],
    )
    op.create_index("ix_project_discussion_reactions_reply_id", "project_discussion_reactions", ["reply_id"])
    op.create_index("ix_project_discussion_reactions_user_id", "project_discussion_reactions", ["user_id"])
    op.create_index(
        "uq_project_discussion_reactions_discussion_user_emoji",
        "project_discussion_reactions",
        ["discussion_id", "user_id", "emoji"],
        unique=True,
        postgresql_where=sa.text("discussion_id IS NOT NULL"),
    )
    op.create_index(
        "uq_project_discussion_reactions_reply_user_emoji",
        "project_discussion_reactions",
        ["reply_id", "user_id", "emoji"],
        unique=True,
        postgresql_where=sa.text("reply_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_project_discussion_reactions_reply_user_emoji", table_name="project_discussion_reactions")
    op.drop_index("uq_project_discussion_reactions_discussion_user_emoji", table_name="project_discussion_reactions")
    op.drop_index("ix_project_discussion_reactions_user_id", table_name="project_discussion_reactions")
    op.drop_index("ix_project_discussion_reactions_reply_id", table_name="project_discussion_reactions")
    op.drop_index("ix_project_discussion_reactions_discussion_id", table_name="project_discussion_reactions")
    op.drop_table("project_discussion_reactions")

    op.drop_index("ix_project_discussion_replies_deleted_at", table_name="project_discussion_replies")
    op.drop_index("ix_project_discussion_replies_discussion_created", table_name="project_discussion_replies")
    op.drop_index("ix_project_discussion_replies_author_id", table_name="project_discussion_replies")
    op.drop_index("ix_project_discussion_replies_discussion_id", table_name="project_discussion_replies")
    op.drop_table("project_discussion_replies")

    op.drop_index("ix_project_discussions_deleted_at", table_name="project_discussions")
    op.drop_index("ix_project_discussions_project_type", table_name="project_discussions")
    op.drop_index("ix_project_discussions_project_pinned_created", table_name="project_discussions")
    op.drop_index("ix_project_discussions_author_id", table_name="project_discussions")
    op.drop_index("ix_project_discussions_project_id", table_name="project_discussions")
    op.drop_table("project_discussions")
