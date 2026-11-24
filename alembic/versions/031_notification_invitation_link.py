"""notification invitation link

Revision ID: 031
Revises: 030
Create Date: 2026-11-23 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "031"
down_revision = "030"
branch_labels = None
depends_on = None


def _has_column(inspector, table: str, column: str) -> bool:
    return any(c["name"] == column for c in inspector.get_columns(table))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "notifications" in inspector.get_table_names() and not _has_column(
        inspector, "notifications", "invitation_id"
    ):
        op.add_column(
            "notifications",
            sa.Column(
                "invitation_id",
                sa.Integer(),
                sa.ForeignKey("workspace_invitations.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "notifications" in inspector.get_table_names() and _has_column(
        inspector, "notifications", "invitation_id"
    ):
        op.drop_column("notifications", "invitation_id")