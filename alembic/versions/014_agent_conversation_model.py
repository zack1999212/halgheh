"""add conversation model selection

Revision ID: 015
Revises: 013
Create Date: 2026-11-16 15:20:00.000000

A conversation may pin its own provider and upstream model id. NULL means "no
conversation selection" so the user preference and then the application default
apply. Changing these columns never touches stored messages.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "015"
down_revision: Union[str, Sequence[str], None] = "014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "agent_conversations",
        sa.Column("provider", sa.String(length=50), nullable=True),
    )
    op.add_column(
        "agent_conversations",
        sa.Column("model", sa.String(length=120), nullable=True),
    )
    op.create_index(
        "ix_agent_conversations_model",
        "agent_conversations",
        ["provider", "model"],
    )


def downgrade() -> None:
    op.drop_index("ix_agent_conversations_model", table_name="agent_conversations")
    op.drop_column("agent_conversations", "model")
    op.drop_column("agent_conversations", "provider")
