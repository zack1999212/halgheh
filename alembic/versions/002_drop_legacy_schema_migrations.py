"""drop legacy schema migrations

Revision ID: 002
Revises: 001
Create Date: 2026-11-15 02:38:13.705995

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '002'
down_revision: Union[str, Sequence[str], None] = '001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # The previous custom migration runner tracked history in
    # schema_migrations. Alembic now uses alembic_version, so the legacy table
    # is obsolete. IF EXISTS keeps this revision safe on fresh databases
    # where the table was never created.
    op.execute("DROP TABLE IF EXISTS schema_migrations")


def downgrade() -> None:
    """Downgrade schema."""
    # Recreate the legacy tracking table for completeness. It is empty and is
    # not used by Alembic.
    op.create_table(
        "schema_migrations",
        sa.Column("version", sa.Integer(), primary_key=True),
        sa.Column("filename", sa.Text(), nullable=False, unique=True),
        sa.Column(
            "applied_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
