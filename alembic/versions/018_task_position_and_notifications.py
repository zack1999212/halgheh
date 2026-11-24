"""task position ordering and task notification reference

Revision ID: 018
Revises: 017
Create Date: 2026-11-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "018"
down_revision: Union[str, Sequence[str], None] = "017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tasks",
        sa.Column("position", sa.BigInteger(), nullable=False, server_default=sa.text("0")),
    )

    # Deterministic per-status ordering for existing rows.
    op.execute(
        sa.text(
            """
            UPDATE tasks
            SET position = ranked.rn * 1000
            FROM (
                SELECT id, ROW_NUMBER() OVER (
                    PARTITION BY status
                    ORDER BY created_at ASC, id ASC
                ) AS rn
                FROM tasks
            ) AS ranked
            WHERE tasks.id = ranked.id
            """
        )
    )

    op.create_index("ix_tasks_status_position_id", "tasks", ["status", "position", "id"], unique=False)

    op.add_column("notifications", sa.Column("task_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_notifications_task_id_tasks",
        "notifications",
        "tasks",
        ["task_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_notifications_task_id", "notifications", ["task_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_notifications_task_id", table_name="notifications")
    op.drop_constraint("fk_notifications_task_id_tasks", "notifications", type_="foreignkey")
    op.drop_column("notifications", "task_id")

    op.drop_index("ix_tasks_status_position_id", table_name="tasks")
    op.drop_column("tasks", "position")
