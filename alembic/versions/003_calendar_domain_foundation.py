"""calendar domain foundation

Revision ID: 003
Revises: 002
Create Date: 2026-11-15 03:10:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "003"
down_revision: Union[str, Sequence[str], None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "calendars",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("color", sa.String(), nullable=True),
        sa.Column(
            "is_default",
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
        sa.CheckConstraint("char_length(name) > 0", name="ck_calendars_name_not_empty"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_calendars_user_id", "calendars", ["user_id"], unique=False)
    op.create_index(
        "uq_calendars_user_default",
        "calendars",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("is_default = true"),
    )

    op.create_table(
        "events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("calendar_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("location", sa.String(), nullable=True),
        sa.Column(
            "is_all_day",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("timezone", sa.String(), nullable=True),
        sa.Column("recurrence_rule", sa.Text(), nullable=True),
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
        sa.CheckConstraint("char_length(title) > 0", name="ck_events_title_not_empty"),
        sa.CheckConstraint(
            "(is_all_day = false AND start_at IS NOT NULL AND end_at IS NOT NULL "
            "AND start_date IS NULL AND end_date IS NULL AND end_at > start_at) OR "
            "(is_all_day = true AND start_date IS NOT NULL AND end_date IS NOT NULL "
            "AND start_at IS NULL AND end_at IS NULL AND end_date > start_date)",
            name="ck_events_timed_or_allday",
        ),
        sa.ForeignKeyConstraint(["calendar_id"], ["calendars.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_events_calendar_id", "events", ["calendar_id"], unique=False)
    op.create_index(
        "ix_events_calendar_start_at", "events", ["calendar_id", "start_at"], unique=False
    )
    op.create_index(
        "ix_events_calendar_start_date",
        "events",
        ["calendar_id", "start_date"],
        unique=False,
    )

    op.create_table(
        "event_exceptions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("original_start_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("original_start_date", sa.Date(), nullable=True),
        sa.Column(
            "is_cancelled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("title", sa.String(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("location", sa.String(), nullable=True),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
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
            "(original_start_at IS NOT NULL AND original_start_date IS NULL) OR "
            "(original_start_at IS NULL AND original_start_date IS NOT NULL)",
            name="ck_event_exceptions_original_identifier",
        ),
        sa.CheckConstraint(
            "("
            "  (start_at IS NULL AND end_at IS NULL AND start_date IS NULL AND end_date IS NULL)"
            "  OR "
            "  (start_at IS NOT NULL AND end_at IS NOT NULL AND start_date IS NULL AND end_date IS NULL AND end_at > start_at)"
            "  OR "
            "  (start_date IS NOT NULL AND end_date IS NOT NULL AND start_at IS NULL AND end_at IS NULL AND end_date > start_date)"
            ")",
            name="ck_event_exceptions_override_time",
        ),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "event_id",
            "original_start_at",
            name="uq_event_exceptions_event_original_start_at",
        ),
        sa.UniqueConstraint(
            "event_id",
            "original_start_date",
            name="uq_event_exceptions_event_original_start_date",
        ),
    )
    op.create_index(
        "ix_event_exceptions_event_id", "event_exceptions", ["event_id"], unique=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_event_exceptions_event_id", table_name="event_exceptions")
    op.drop_table("event_exceptions")

    op.drop_index("ix_events_calendar_start_date", table_name="events")
    op.drop_index("ix_events_calendar_start_at", table_name="events")
    op.drop_index("ix_events_calendar_id", table_name="events")
    op.drop_table("events")

    op.drop_index("uq_calendars_user_default", table_name="calendars")
    op.drop_index("ix_calendars_user_id", table_name="calendars")
    op.drop_table("calendars")
