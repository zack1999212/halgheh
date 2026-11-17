"""mark discovered provider models as removable

Revision ID: 016
Revises: 014
Create Date: 2026-11-16 16:20:00.000000

Models added by a "Refresh catalogue" run are provider-reported, not curated,
so they must be removable when nothing references them. They were stored with
``is_custom = false``, which made them indistinguishable from the seeded
catalogue and undeletable. A separate flag keeps the seeded models protected.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "016"
down_revision: Union[str, Sequence[str], None] = "015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Models seeded by migration 013; these are the protected built-ins.
SEEDED_ZAI_MODELS = ("glm-4.5-flash", "glm-4.7-flash", "glm-4.5", "glm-5.3")


def upgrade() -> None:
    op.add_column(
        "provider_models",
        sa.Column(
            "is_discovered",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )

    # Backfill: every row that is not user-entered and not part of the seed was
    # added by discovery, so it becomes removable again.
    op.execute(
        sa.text(
            "UPDATE provider_models SET is_discovered = true "
            "WHERE is_custom = false "
            "AND NOT (provider_id = 'zai' AND upstream_model_id IN :seeded)"
        ).bindparams(sa.bindparam("seeded", expanding=True, value=list(SEEDED_ZAI_MODELS)))
    )


def downgrade() -> None:
    op.drop_column("provider_models", "is_discovered")
