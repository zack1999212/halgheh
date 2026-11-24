"""workspace activity

Revision ID: 032
Revises: 031
Create Date: 2026-11-23 00:00:00.000000

Extends the existing project_activities table so the same immutable records
can be scoped to a workspace. Existing rows and event types are preserved.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "032"
down_revision = "031"
branch_labels = None
depends_on = None


def _has_column(inspector, table: str, column: str) -> bool:
    return any(c["name"] == column for c in inspector.get_columns(table))


def _has_index(inspector, table: str, name: str) -> bool:
    return any(i["name"] == name for i in inspector.get_indexes(table))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "project_activities" not in inspector.get_table_names():
        return

    if not _has_column(inspector, "project_activities", "workspace_id"):
        op.add_column(
            "project_activities",
            sa.Column(
                "workspace_id",
                sa.Integer(),
                sa.ForeignKey("workspaces.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )

    # Workspace-only activity has no owning project; legacy rows keep theirs.
    project_column = next(
        c for c in sa.inspect(bind).get_columns("project_activities") if c["name"] == "project_id"
    )
    if project_column["nullable"] is False:
        op.alter_column(
            "project_activities",
            "project_id",
            existing_type=sa.Integer(),
            nullable=True,
        )

    inspector = sa.inspect(bind)
    if not _has_index(inspector, "project_activities", "ix_project_activities_workspace_created_id"):
        op.create_index(
            "ix_project_activities_workspace_created_id",
            "project_activities",
            ["workspace_id", "created_at", "id"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "project_activities" not in inspector.get_table_names():
        return
    if _has_index(inspector, "project_activities", "ix_project_activities_workspace_created_id"):
        op.drop_index(
            "ix_project_activities_workspace_created_id",
            table_name="project_activities",
        )
    if _has_column(inspector, "project_activities", "workspace_id"):
        op.drop_column("project_activities", "workspace_id")
