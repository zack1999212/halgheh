"""project activities

Adds project_activities table for centralized project activity feed.

Revision ID: 026
Revises: 025
Create Date: 2026-11-21 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "026"
down_revision: Union[str, Sequence[str], None] = "025"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "project_activities",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "project_id",
            sa.Integer(),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "actor_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("entity_type", sa.String(length=64), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_project_activities_project_id",
        "project_activities",
        ["project_id"],
    )
    op.create_index(
        "ix_project_activities_actor_id",
        "project_activities",
        ["actor_id"],
    )
    op.create_index(
        "ix_project_activities_event_type",
        "project_activities",
        ["event_type"],
    )
    op.create_index(
        "ix_project_activities_project_created_id",
        "project_activities",
        ["project_id", "created_at", "id"],
    )


def downgrade() -> None:
    op.drop_index("ix_project_activities_project_created_id", table_name="project_activities")
    op.drop_index("ix_project_activities_event_type", table_name="project_activities")
    op.drop_index("ix_project_activities_actor_id", table_name="project_activities")
    op.drop_index("ix_project_activities_project_id", table_name="project_activities")
    op.drop_table("project_activities")
