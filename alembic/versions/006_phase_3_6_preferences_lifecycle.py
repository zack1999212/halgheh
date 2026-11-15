"""notification preferences and lifecycle

Revision ID: 006
Revises: 005
Create Date: 2026-11-15 06:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "006"
down_revision: Union[str, Sequence[str], None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Normalize existing notification read-state before enforcing consistency.
    op.execute(
        "UPDATE notifications SET read_at = now() "
        "WHERE is_read = true AND read_at IS NULL"
    )
    op.execute(
        "UPDATE notifications SET read_at = NULL "
        "WHERE is_read = false AND read_at IS NOT NULL"
    )

    op.create_check_constraint(
        "ck_notifications_read_state",
        "notifications",
        "(is_read = false AND read_at IS NULL) OR (is_read = true AND read_at IS NOT NULL)",
    )

    op.create_index(
        "ix_notifications_created_at",
        "notifications",
        ["created_at"],
        unique=False,
    )

    # Allow scheduled reminders to be terminally skipped when notifications are disabled.
    op.drop_constraint(
        "ck_scheduled_reminders_status", "scheduled_reminders", type_="check"
    )
    op.create_check_constraint(
        "ck_scheduled_reminders_status",
        "scheduled_reminders",
        "status IN ('pending', 'processed', 'cancelled', 'skipped')",
    )

    op.create_table(
        "notification_preferences",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column(
            "calendar_reminders_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
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
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", name="uq_notification_preferences_user_id"),
    )
    op.create_index(
        "ix_notification_preferences_user_id",
        "notification_preferences",
        ["user_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_notification_preferences_user_id", table_name="notification_preferences")
    op.drop_table("notification_preferences")

    op.drop_constraint(
        "ck_scheduled_reminders_status", "scheduled_reminders", type_="check"
    )
    op.create_check_constraint(
        "ck_scheduled_reminders_status",
        "scheduled_reminders",
        "status IN ('pending', 'processed', 'cancelled')",
    )

    op.drop_index("ix_notifications_created_at", table_name="notifications")
    op.drop_constraint("ck_notifications_read_state", "notifications", type_="check")