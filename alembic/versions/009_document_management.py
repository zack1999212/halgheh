"""document management

Revision ID: 009
Revises: 008
Create Date: 2026-11-16 09:00:00.000000

Document Management module schema:
workspaces, folders, documents, document_links, tags, document_tags,
document_versions, document_favorites, document_permissions.

All tables are owned by service/docs/models and registered on the shared
service.core.database.Base; the migration is generated from that metadata.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "009"
down_revision: Union[str, Sequence[str], None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "workspaces",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "char_length(name) > 0", name="ck_workspaces_name_not_empty"
        ),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_workspaces_owner_id", "workspaces", ["owner_id"])

    op.create_table(
        "folders",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("parent_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "char_length(name) > 0", name="ck_folders_name_not_empty"
        ),
        sa.ForeignKeyConstraint(
            ["parent_id"], ["folders.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"], ["workspaces.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_folders_workspace_id", "folders", ["workspace_id"])
    op.create_index(
        "ix_folders_workspace_parent", "folders", ["workspace_id", "parent_id"]
    )
    # Unique folder names per parent. Postgres treats NULLs as distinct, so a
    # single constraint cannot also reject duplicate root folder names; two
    # partial unique indexes cover both cases.
    op.create_index(
        "uq_folders_workspace_parent_name",
        "folders",
        ["workspace_id", "parent_id", "name"],
        unique=True,
    )
    op.create_index(
        "uq_folders_root_name",
        "folders",
        ["workspace_id", "name"],
        unique=True,
        postgresql_where=sa.text("parent_id IS NULL"),
    )

    op.create_table(
        "tags",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(64), nullable=False),
        sa.Column("color", sa.String(7), nullable=False),
        sa.CheckConstraint(
            "char_length(name) > 0", name="ck_tags_name_not_empty"
        ),
        sa.CheckConstraint(
            "color ~ '^#[0-9a-fA-F]{6}$'", name="ck_tags_color_hex"
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"], ["workspaces.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("workspace_id", "name", name="uq_tags_workspace_name"),
    )
    op.create_index("ix_tags_workspace_id", "tags", ["workspace_id"])

    op.create_table(
        "documents",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("folder_id", sa.Integer(), nullable=True),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(256), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("slug", sa.String(255), nullable=False),
        sa.Column("icon", sa.String(32), nullable=True),
        sa.Column(
            "is_favorite",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "is_archived",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "is_deleted",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "char_length(title) > 0", name="ck_documents_title_not_empty"
        ),
        sa.CheckConstraint(
            "char_length(slug) > 0", name="ck_documents_slug_not_empty"
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"], ["workspaces.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["folder_id"], ["folders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "workspace_id", "slug", name="uq_documents_workspace_slug"
        ),
    )
    op.create_index(
        "ix_documents_workspace_folder", "documents", ["workspace_id", "folder_id"]
    )
    op.create_index("ix_documents_owner_id", "documents", ["owner_id"])
    op.create_index(
        "ix_documents_workspace_archived", "documents", ["workspace_id", "is_archived"]
    )

    op.create_table(
        "document_versions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("document_id", sa.Integer(), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(256), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "version_number >= 1",
            name="ck_document_versions_version_number_positive",
        ),
        sa.CheckConstraint(
            "char_length(title) > 0",
            name="ck_document_versions_title_not_empty",
        ),
        sa.ForeignKeyConstraint(
            ["document_id"], ["documents.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "document_id", "version_number",
            name="uq_document_versions_document_version",
        ),
    )
    op.create_index(
        "ix_document_versions_document_id", "document_versions", ["document_id"]
    )

    op.create_table(
        "document_links",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("source_document_id", sa.Integer(), nullable=False),
        sa.Column("target_document_id", sa.Integer(), nullable=False),
        sa.Column("link_type", sa.String(32), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "source_document_id <> target_document_id",
            name="ck_document_links_not_self",
        ),
        sa.CheckConstraint(
            "link_type IN ('related', 'reference', 'depends_on')",
            name="ck_document_links_link_type",
        ),
        sa.ForeignKeyConstraint(
            ["source_document_id"], ["documents.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["target_document_id"], ["documents.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "source_document_id", "target_document_id", "link_type",
            name="uq_document_links_source_target_type",
        ),
    )
    op.create_index(
        "ix_document_links_target_document_id",
        "document_links",
        ["target_document_id"],
    )

    op.create_table(
        "document_tags",
        sa.Column("document_id", sa.Integer(), nullable=False),
        sa.Column("tag_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["document_id"], ["documents.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["tag_id"], ["tags.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("document_id", "tag_id"),
    )
    op.create_index("ix_document_tags_tag_id", "document_tags", ["tag_id"])

    op.create_table(
        "document_favorites",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("document_id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["document_id"], ["documents.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "document_id", name="uq_document_favorites_user_document"
        ),
    )
    op.create_index(
        "ix_document_favorites_user_id", "document_favorites", ["user_id"]
    )

    op.create_table(
        "document_permissions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("document_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("permission_level", sa.String(16), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "permission_level IN ('viewer', 'editor')",
            name="ck_document_permissions_level",
        ),
        sa.ForeignKeyConstraint(
            ["document_id"], ["documents.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "document_id", "user_id",
            name="uq_document_permissions_document_user",
        ),
    )
    op.create_index(
        "ix_document_permissions_user_id", "document_permissions", ["user_id"]
    )


def downgrade() -> None:
    # Children first, parents last; pure metadata drops, no data changes to
    # any other module's tables.
    op.drop_table("document_permissions")
    op.drop_table("document_favorites")
    op.drop_index("ix_document_tags_tag_id", table_name="document_tags")
    op.drop_table("document_tags")
    op.drop_index(
        "ix_document_links_target_document_id", table_name="document_links"
    )
    op.drop_table("document_links")
    op.drop_index(
        "ix_document_versions_document_id", table_name="document_versions"
    )
    op.drop_table("document_versions")
    op.drop_index(
        "ix_documents_workspace_archived", table_name="documents"
    )
    op.drop_index("ix_documents_owner_id", table_name="documents")
    op.drop_index(
        "ix_documents_workspace_folder", table_name="documents"
    )
    op.drop_table("documents")
    op.drop_index("ix_tags_workspace_id", table_name="tags")
    op.drop_table("tags")
    op.drop_index(
        "uq_folders_root_name",
        table_name="folders",
        postgresql_where=sa.text("parent_id IS NULL"),
    )
    op.drop_index("uq_folders_workspace_parent_name", table_name="folders")
    op.drop_index("ix_folders_workspace_parent", table_name="folders")
    op.drop_index("ix_folders_workspace_id", table_name="folders")
    op.drop_table("folders")
    op.drop_index("ix_workspaces_owner_id", table_name="workspaces")
    op.drop_table("workspaces")
