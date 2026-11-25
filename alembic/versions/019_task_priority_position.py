"""task priority position ordering

Revision ID: 019
Revises: 018
Create Date: 2026-11-23 00:00:00.000000

Adds an independent priority_position column so Priority Board ordering is
persisted separately from status-board position. Existing status ordering is
preserved.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "019_task_prio"
down_revision: Union[str, Sequence[str], None] = "018_task_pos"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tasks",
        sa.Column("priority_position", sa.BigInteger(), nullable=False, server_default=sa.text("0")),
    )

    # Deterministic per-priority ordering for existing rows.
    op.execute(
        sa.text(
            """
            UPDATE tasks
            SET priority_position = ranked.rn * 1000
            FROM (
                SELECT id, ROW_NUMBER() OVER (
                    PARTITION BY priority
                    ORDER BY created_at ASC, id ASC
                ) AS rn
                FROM tasks
            ) AS ranked
            WHERE tasks.id = ranked.id
            """
        )
    )

    op.create_index(
        "ix_tasks_priority_position_id",
        "tasks",
        ["priority", "priority_position", "id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_tasks_priority_position_id", table_name="tasks")
    op.drop_column("tasks", "priority_position")
