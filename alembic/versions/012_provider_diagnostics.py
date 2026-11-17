"""add provider diagnostics table

Revision ID: 012
Revises: 011
Create Date: 2026-11-16 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "012"
down_revision: Union[str, Sequence[str], None] = "011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "provider_diagnostics",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("request_id", sa.String(length=64), nullable=False),
        sa.Column("conversation_id", sa.Integer(), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("model", sa.String(length=64), nullable=False),
        sa.Column("attempt", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("http_status_code", sa.Integer(), nullable=True),
        sa.Column("provider_error_code", sa.String(length=32), nullable=True),
        sa.Column("provider_error_message", sa.Text(), nullable=True),
        sa.Column("connected", sa.Boolean(), nullable=True),
        sa.Column("headers_received", sa.Boolean(), nullable=True),
        sa.Column("streaming_started", sa.Boolean(), nullable=True),
        sa.Column("streaming_completed", sa.Boolean(), nullable=True),
        sa.Column("connection_interrupted", sa.Boolean(), nullable=True),
        sa.Column("retry_attempted", sa.Boolean(), nullable=True),
        sa.Column("final_status", sa.String(length=20), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("request_id"),
        sa.Index("ix_provider_diagnostics_conversation", "conversation_id"),
        sa.Index("ix_provider_diagnostics_user", "user_id"),
        sa.Index("ix_provider_diagnostics_provider", "provider"),
        sa.Index("ix_provider_diagnostics_status", "status"),
    )


def downgrade() -> None:
    op.drop_table("provider_diagnostics")