"""event project association

Extends events with an optional project_id foreign key.

Revision ID: 022
Revises: 021
Create Date: 2026-11-19 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "022"
down_revision: Union[str, Sequence[str], None] = "021"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "events",
        sa.Column("project_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_events_project_id",
        "events",
        "projects",
        ["project_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_events_project_id", "events", ["project_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_events_project_id", table_name="events")
    op.drop_constraint("fk_events_project_id", "events", type_="foreignkey")
    op.drop_column("events", "project_id")
