"""milestone steps and roadmap ordering

Extends project_milestones with roadmap position and introduces
project_milestone_steps for ordered, independent milestone step records.

Revision ID: 024
Revises: 023
Create Date: 2026-11-19 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "024"
down_revision: Union[str, Sequence[str], None] = "023"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "project_milestones",
        sa.Column("position", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.create_check_constraint(
        "ck_project_milestones_position_nonneg",
        "project_milestones",
        "position >= 0",
    )
    op.create_index(
        "ix_project_milestones_project_position",
        "project_milestones",
        ["project_id", "position"],
        unique=False,
    )

    # Backfill deterministic roadmap positions for existing milestones per project.
    op.execute(
        sa.text(
            """
            WITH ranked AS (
                SELECT
                    id,
                    ROW_NUMBER() OVER (
                        PARTITION BY project_id
                        ORDER BY
                            due_date ASC NULLS LAST,
                            created_at ASC,
                            id ASC
                    ) - 1 AS pos
                FROM project_milestones
            )
            UPDATE project_milestones AS m
            SET position = ranked.pos
            FROM ranked
            WHERE m.id = ranked.id
            """
        )
    )

    op.create_table(
        "project_milestone_steps",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("milestone_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column(
            "is_completed",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "length(title) > 0",
            name="ck_project_milestone_steps_title_not_empty",
        ),
        sa.CheckConstraint(
            "position >= 0",
            name="ck_project_milestone_steps_position_nonneg",
        ),
        sa.CheckConstraint(
            "(is_completed = TRUE AND completed_at IS NOT NULL) OR "
            "(is_completed = FALSE AND completed_at IS NULL)",
            name="ck_project_milestone_steps_completed_state",
        ),
        sa.ForeignKeyConstraint(
            ["milestone_id"],
            ["project_milestones.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_project_milestone_steps_milestone_id",
        "project_milestone_steps",
        ["milestone_id"],
        unique=False,
    )
    op.create_index(
        "ix_project_milestone_steps_milestone_position",
        "project_milestone_steps",
        ["milestone_id", "position"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_project_milestone_steps_milestone_position",
        table_name="project_milestone_steps",
    )
    op.drop_index(
        "ix_project_milestone_steps_milestone_id",
        table_name="project_milestone_steps",
    )
    op.drop_table("project_milestone_steps")
    op.drop_index(
        "ix_project_milestones_project_position",
        table_name="project_milestones",
    )
    op.drop_constraint(
        "ck_project_milestones_position_nonneg",
        "project_milestones",
        type_="check",
    )
    op.drop_column("project_milestones", "position")
