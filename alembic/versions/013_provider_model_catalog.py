"""add provider model catalogue

Revision ID: 014
Revises: 012
Create Date: 2026-11-16 15:10:00.000000

Creates the database-backed provider model catalogue and seeds the initial Z.ai
catalogue. Model rows hold the exact upstream identifier sent to the provider
API, separate from the display name.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "014"
down_revision: Union[str, Sequence[str], None] = "013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Pricing taken from Z.ai's published pricing page (verified 2026-11-16):
# GLM-4.5-Flash and GLM-4.7-Flash are free; GLM-4.5 and GLM-5.3 are billed per
# 1M tokens. Context windows are the vendor-published figures.
ZAI_MODELS = (
    {
        "upstream_model_id": "glm-4.5-flash",
        "display_name": "GLM-4.5-Flash",
        "description": (
            "Free, fast GLM model with tool calling. The default Halgheh model."
        ),
        "context_window": 200000,
        "supports_tools": True,
        "supports_streaming": True,
        "supports_vision": False,
        "pricing_class": "free",
        "input_price_per_mtok": 0,
        "output_price_per_mtok": 0,
    },
    {
        "upstream_model_id": "glm-4.7-flash",
        "display_name": "GLM-4.7-Flash",
        "description": "Free flash-tier model with tool calling.",
        "context_window": 200000,
        "supports_tools": True,
        "supports_streaming": True,
        "supports_vision": False,
        "pricing_class": "free",
        "input_price_per_mtok": 0,
        "output_price_per_mtok": 0,
    },
    {
        "upstream_model_id": "glm-4.5",
        "display_name": "GLM-4.5",
        "description": "Paid general-purpose GLM model with tool calling.",
        "context_window": 128000,
        "supports_tools": True,
        "supports_streaming": True,
        "supports_vision": False,
        "pricing_class": "paid",
        "input_price_per_mtok": 0.6,
        "output_price_per_mtok": 2.2,
    },
    {
        "upstream_model_id": "glm-5.3",
        "display_name": "GLM-5.3",
        "description": "Paid flagship GLM model with tool calling. 1M context.",
        "context_window": 1000000,
        "supports_tools": True,
        "supports_streaming": True,
        "supports_vision": False,
        "pricing_class": "paid",
        "input_price_per_mtok": 1.4,
        "output_price_per_mtok": 4.4,
    },
)


def upgrade() -> None:
    provider_models = op.create_table(
        "provider_models",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("provider_id", sa.String(length=50), nullable=False),
        sa.Column("upstream_model_id", sa.String(length=120), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("context_window", sa.Integer(), nullable=True),
        sa.Column("max_output_tokens", sa.Integer(), nullable=True),
        sa.Column("supports_tools", sa.Boolean(), nullable=True),
        sa.Column("supports_streaming", sa.Boolean(), nullable=True),
        sa.Column("supports_vision", sa.Boolean(), nullable=True),
        sa.Column(
            "enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
        sa.Column(
            "pricing_class",
            sa.String(length=10),
            nullable=False,
            server_default="unknown",
        ),
        sa.Column("input_price_per_mtok", sa.Numeric(12, 4), nullable=True),
        sa.Column("output_price_per_mtok", sa.Numeric(12, 4), nullable=True),
        sa.Column(
            "is_custom", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
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
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "provider_id", "upstream_model_id", name="uq_provider_models_upstream"
        ),
    )
    op.create_index(
        "ix_provider_models_provider_enabled",
        "provider_models",
        ["provider_id", "enabled"],
    )

    op.bulk_insert(
        provider_models,
        [
            {
                "provider_id": "zai",
                "enabled": True,
                "is_custom": False,
                **model,
            }
            for model in ZAI_MODELS
        ],
    )


def downgrade() -> None:
    op.drop_index("ix_provider_models_provider_enabled", table_name="provider_models")
    op.drop_table("provider_models")
