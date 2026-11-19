"""project domain foundation

Projects owned by users with lifecycle status and archive metadata.

Revision ID: 018
Revises: 017
Create Date: 2026-11-18 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "018"
down_revision: Union[str, Sequence[str], None] = "017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the projects table."""
    op.create_table(
        "projects",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column(
            "status",
            sa.String(length=32),
            server_default=sa.text("'active'"),
            nullable=False,
        ),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("target_date", sa.Date(), nullable=True),
        sa.Column("color", sa.String(length=32), nullable=True),
        sa.Column("icon", sa.String(length=64), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.CheckConstraint("char_length(name) > 0", name="ck_projects_name_not_empty"),
        sa.CheckConstraint(
            "status IN ('active', 'on_hold', 'completed', 'archived')",
            name="ck_projects_status",
        ),
        sa.CheckConstraint(
            "start_date IS NULL OR target_date IS NULL OR start_date <= target_date",
            name="ck_projects_date_order",
        ),
        sa.CheckConstraint(
            "(status = 'archived' AND archived_at IS NOT NULL) OR "
            "(status != 'archived' AND archived_at IS NULL)",
            name="ck_projects_archived_state",
        ),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_projects_owner_id", "projects", ["owner_id"], unique=False)
    op.create_index("ix_projects_status", "projects", ["status"], unique=False)
    op.create_index(
        "ix_projects_owner_id_status",
        "projects",
        ["owner_id", "status"],
        unique=False,
    )


def downgrade() -> None:
    """Drop the projects table."""
    op.drop_index("ix_projects_owner_id_status", table_name="projects")
    op.drop_index("ix_projects_status", table_name="projects")
    op.drop_index("ix_projects_owner_id", table_name="projects")
    op.drop_table("projects")
