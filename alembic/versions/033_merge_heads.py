"""merge heads

Revision ID: 033_merge_heads
Revises: 032, 020_task_checklist
Create Date: 2026-11-25 00:00:00.000000

Merge-only revision: joins the project/workspace branch (032) and the
task follow-up branch (020_task_checklist). It intentionally performs no
schema or data changes.
"""

from __future__ import annotations

revision = "033_merge_heads"
down_revision = ("032", "020_task_checklist")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
