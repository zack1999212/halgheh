"""scheduling and notifications

Revision ID: 005
Revises: 004
Create Date: 2026-11-15 05:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "005"
down_revision: Union[str, Sequence[str], None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "scheduled_reminders",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("reminder_id", sa.Integer(), nullable=False),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("occurrence_start_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("occurrence_start_date", sa.Date(), nullable=True),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "status",
            sa.String(),
            nullable=False,
            server_default=sa.text("'pending'"),
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
            "status IN ('pending', 'processed', 'cancelled')",
            name="ck_scheduled_reminders_status",
        ),
        sa.CheckConstraint(
            "(occurrence_start_at IS NOT NULL) <> (occurrence_start_date IS NOT NULL)",
            name="ck_scheduled_reminders_occurrence_identity",
        ),
        sa.ForeignKeyConstraint(["reminder_id"], ["reminders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_scheduled_reminders_reminder_id", "scheduled_reminders", ["reminder_id"], unique=False)
    op.create_index("ix_scheduled_reminders_event_id", "scheduled_reminders", ["event_id"], unique=False)
    op.create_index("ix_scheduled_reminders_status_scheduled_at", "scheduled_reminders", ["status", "scheduled_at"], unique=False)
    op.create_index(
        "ix_scheduled_reminders_due",
        "scheduled_reminders",
        ["scheduled_at"],
        unique=False,
        postgresql_where=sa.text("status = 'pending'"),
    )
    op.create_index(
        "uq_scheduled_reminders_timed",
        "scheduled_reminders",
        ["reminder_id", "occurrence_start_at"],
        unique=True,
        postgresql_where=sa.text("occurrence_start_at IS NOT NULL"),
    )
    op.create_index(
        "uq_scheduled_reminders_allday",
        "scheduled_reminders",
        ["reminder_id", "occurrence_start_date"],
        unique=True,
        postgresql_where=sa.text("occurrence_start_date IS NOT NULL"),
    )

    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column(
            "is_read",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("event_id", sa.Integer(), nullable=True),
        sa.Column("reminder_id", sa.Integer(), nullable=True),
        sa.Column("scheduled_reminder_id", sa.Integer(), nullable=True),
        sa.Column("occurrence_start_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("occurrence_start_date", sa.Date(), nullable=True),
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
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["reminder_id"], ["reminders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["scheduled_reminder_id"], ["scheduled_reminders.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notifications_user_id_created_at", "notifications", ["user_id", "created_at"], unique=False)
    op.create_index("ix_notifications_user_id_is_read", "notifications", ["user_id", "is_read"], unique=False)
    op.create_index(
        "uq_notifications_scheduled_reminder",
        "notifications",
        ["scheduled_reminder_id"],
        unique=True,
        postgresql_where=sa.text("scheduled_reminder_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_notifications_scheduled_reminder", table_name="notifications")
    op.drop_index("ix_notifications_user_id_is_read", table_name="notifications")
    op.drop_index("ix_notifications_user_id_created_at", table_name="notifications")
    op.drop_table("notifications")

    op.drop_index("uq_scheduled_reminders_allday", table_name="scheduled_reminders")
    op.drop_index("uq_scheduled_reminders_timed", table_name="scheduled_reminders")
    op.drop_index("ix_scheduled_reminders_due", table_name="scheduled_reminders")
    op.drop_index("ix_scheduled_reminders_status_scheduled_at", table_name="scheduled_reminders")
    op.drop_index("ix_scheduled_reminders_event_id", table_name="scheduled_reminders")
    op.drop_index("ix_scheduled_reminders_reminder_id", table_name="scheduled_reminders")
    op.drop_table("scheduled_reminders")
