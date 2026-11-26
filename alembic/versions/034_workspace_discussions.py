"""replace project discussions with workspace discussions

Discussion authors own their posts and messages; every workspace member may
reply and react. Project-scoped discussion tables are removed.

Revision ID: 034
Revises: 033
Create Date: 2026-11-25 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "034"
down_revision: Union[str, Sequence[str], None] = "033"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _new_tables() -> None:
    op.create_table(
        "workspace_discussions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("author_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("type", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("is_pinned", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("type IN ('announcement', 'discussion')", name="ck_workspace_discussions_type"),
        sa.CheckConstraint("length(btrim(title)) > 0", name="ck_workspace_discussions_title_not_empty"),
        sa.CheckConstraint("length(btrim(content)) > 0", name="ck_workspace_discussions_content_not_empty"),
    )
    for name, columns in (
        ("ix_workspace_discussions_workspace_id", ["workspace_id"]),
        ("ix_workspace_discussions_author_id", ["author_id"]),
        ("ix_workspace_discussions_workspace_pinned_created", ["workspace_id", "is_pinned", "created_at", "id"]),
        ("ix_workspace_discussions_workspace_type", ["workspace_id", "type"]),
        ("ix_workspace_discussions_deleted_at", ["deleted_at"]),
    ):
        op.create_index(name, "workspace_discussions", columns)

    op.create_table(
        "workspace_discussion_replies",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("discussion_id", sa.Integer(), sa.ForeignKey("workspace_discussions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("author_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("length(btrim(content)) > 0", name="ck_workspace_discussion_replies_content_not_empty"),
    )
    for name, columns in (
        ("ix_workspace_discussion_replies_discussion_id", ["discussion_id"]),
        ("ix_workspace_discussion_replies_author_id", ["author_id"]),
        ("ix_workspace_discussion_replies_discussion_created", ["discussion_id", "created_at", "id"]),
        ("ix_workspace_discussion_replies_deleted_at", ["deleted_at"]),
    ):
        op.create_index(name, "workspace_discussion_replies", columns)

    op.create_table(
        "workspace_discussion_reactions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("discussion_id", sa.Integer(), sa.ForeignKey("workspace_discussions.id", ondelete="CASCADE"), nullable=True),
        sa.Column("reply_id", sa.Integer(), sa.ForeignKey("workspace_discussion_replies.id", ondelete="CASCADE"), nullable=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("emoji", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "(discussion_id IS NOT NULL AND reply_id IS NULL) OR "
            "(discussion_id IS NULL AND reply_id IS NOT NULL)",
            name="ck_workspace_discussion_reactions_target",
        ),
        sa.CheckConstraint("length(btrim(emoji)) > 0", name="ck_workspace_discussion_reactions_emoji_not_empty"),
    )
    for name, columns in (
        ("ix_workspace_discussion_reactions_discussion_id", ["discussion_id"]),
        ("ix_workspace_discussion_reactions_reply_id", ["reply_id"]),
        ("ix_workspace_discussion_reactions_user_id", ["user_id"]),
    ):
        op.create_index(name, "workspace_discussion_reactions", columns)
    op.create_index(
        "uq_workspace_discussion_reactions_discussion_user_emoji",
        "workspace_discussion_reactions",
        ["discussion_id", "user_id", "emoji"],
        unique=True,
        postgresql_where=sa.text("discussion_id IS NOT NULL"),
    )
    op.create_index(
        "uq_workspace_discussion_reactions_reply_user_emoji",
        "workspace_discussion_reactions",
        ["reply_id", "user_id", "emoji"],
        unique=True,
        postgresql_where=sa.text("reply_id IS NOT NULL"),
    )


def _old_tables() -> None:
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
    for name, columns in (
        ("ix_project_discussions_project_id", ["project_id"]),
        ("ix_project_discussions_author_id", ["author_id"]),
        ("ix_project_discussions_project_pinned_created", ["project_id", "is_pinned", "created_at", "id"]),
        ("ix_project_discussions_project_type", ["project_id", "type"]),
        ("ix_project_discussions_deleted_at", ["deleted_at"]),
    ):
        op.create_index(name, "project_discussions", columns)

    op.create_table(
        "project_discussion_replies",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("discussion_id", sa.Integer(), sa.ForeignKey("project_discussions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("author_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("length(btrim(content)) > 0", name="ck_project_discussion_replies_content_not_empty"),
    )
    for name, columns in (
        ("ix_project_discussion_replies_discussion_id", ["discussion_id"]),
        ("ix_project_discussion_replies_author_id", ["author_id"]),
        ("ix_project_discussion_replies_discussion_created", ["discussion_id", "created_at", "id"]),
        ("ix_project_discussion_replies_deleted_at", ["deleted_at"]),
    ):
        op.create_index(name, "project_discussion_replies", columns)

    op.create_table(
        "project_discussion_reactions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("discussion_id", sa.Integer(), sa.ForeignKey("project_discussions.id", ondelete="CASCADE"), nullable=True),
        sa.Column("reply_id", sa.Integer(), sa.ForeignKey("project_discussion_replies.id", ondelete="CASCADE"), nullable=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("emoji", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "(discussion_id IS NOT NULL AND reply_id IS NULL) OR "
            "(discussion_id IS NULL AND reply_id IS NOT NULL)",
            name="ck_project_discussion_reactions_target",
        ),
        sa.CheckConstraint("length(btrim(emoji)) > 0", name="ck_project_discussion_reactions_emoji_not_empty"),
    )
    for name, columns in (
        ("ix_project_discussion_reactions_discussion_id", ["discussion_id"]),
        ("ix_project_discussion_reactions_reply_id", ["reply_id"]),
        ("ix_project_discussion_reactions_user_id", ["user_id"]),
    ):
        op.create_index(name, "project_discussion_reactions", columns)
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


def _reset_sequences(tables: tuple[str, ...]) -> None:
    for table in tables:
        op.execute(
            sa.text(
                f"""
                SELECT setval(pg_get_serial_sequence('{table}', 'id'),
                              GREATEST(COALESCE((SELECT MAX(id) FROM {table}), 0), 1))
                """
            )
        )


def upgrade() -> None:
    _new_tables()
    op.execute(
        sa.text(
            """
            INSERT INTO workspace_discussions
                (id, workspace_id, author_id, type, title, content,
                 is_pinned, created_at, updated_at, deleted_at)
            SELECT d.id, p.workspace_id, d.author_id, d.type, d.title, d.content,
                   d.is_pinned, d.created_at, d.updated_at, d.deleted_at
            FROM project_discussions AS d
            JOIN projects AS p ON p.id = d.project_id
            WHERE p.workspace_id IS NOT NULL
            """
        )
    )
    op.execute(
        sa.text(
            """
            INSERT INTO workspace_discussion_replies
                (id, discussion_id, author_id, content, created_at, updated_at, deleted_at)
            SELECT r.id, r.discussion_id, r.author_id, r.content,
                   r.created_at, r.updated_at, r.deleted_at
            FROM project_discussion_replies AS r
            WHERE r.discussion_id IN (SELECT id FROM workspace_discussions)
            """
        )
    )
    op.execute(
        sa.text(
            """
            INSERT INTO workspace_discussion_reactions
                (id, discussion_id, reply_id, user_id, emoji, created_at)
            SELECT x.id, x.discussion_id, x.reply_id, x.user_id, x.emoji, x.created_at
            FROM project_discussion_reactions AS x
            WHERE x.discussion_id IN (SELECT id FROM workspace_discussions)
               OR x.reply_id IN (SELECT id FROM workspace_discussion_replies)
            """
        )
    )
    _reset_sequences(("workspace_discussions", "workspace_discussion_replies", "workspace_discussion_reactions"))

    op.drop_table("project_discussion_reactions")
    op.drop_table("project_discussion_replies")
    op.drop_table("project_discussions")


def downgrade() -> None:
    _old_tables()
    op.execute(
        sa.text(
            """
            INSERT INTO project_discussions
                (id, project_id, author_id, type, title, content,
                 is_pinned, created_at, updated_at, deleted_at)
            SELECT d.id,
                   (SELECT p.id FROM projects AS p
                    WHERE p.workspace_id = d.workspace_id ORDER BY p.id LIMIT 1),
                   d.author_id, d.type, d.title, d.content, d.is_pinned,
                   d.created_at, d.updated_at, d.deleted_at
            FROM workspace_discussions AS d
            WHERE EXISTS (SELECT 1 FROM projects AS p WHERE p.workspace_id = d.workspace_id)
            """
        )
    )
    op.execute(
        sa.text(
            """
            INSERT INTO project_discussion_replies
                (id, discussion_id, author_id, content, created_at, updated_at, deleted_at)
            SELECT r.id, r.discussion_id, r.author_id, r.content,
                   r.created_at, r.updated_at, r.deleted_at
            FROM workspace_discussion_replies AS r
            WHERE r.discussion_id IN (SELECT id FROM project_discussions)
            """
        )
    )
    op.execute(
        sa.text(
            """
            INSERT INTO project_discussion_reactions
                (id, discussion_id, reply_id, user_id, emoji, created_at)
            SELECT x.id, x.discussion_id, x.reply_id, x.user_id, x.emoji, x.created_at
            FROM workspace_discussion_reactions AS x
            WHERE x.discussion_id IN (SELECT id FROM project_discussions)
               OR x.reply_id IN (SELECT id FROM project_discussion_replies)
            """
        )
    )
    _reset_sequences(("project_discussions", "project_discussion_replies", "project_discussion_reactions"))

    op.drop_table("workspace_discussion_reactions")
    op.drop_table("workspace_discussion_replies")
    op.drop_table("workspace_discussions")
