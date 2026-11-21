"""task and document project association

Extends tasks and documents with an optional project_id foreign key.

Revision ID: 021
Revises: 020
Create Date: 2026-11-19 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "021"
down_revision: Union[str, Sequence[str], None] = "020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add nullable project_id to tasks and documents."""
    op.add_column(
        "tasks",
        sa.Column("project_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_tasks_project_id",
        "tasks",
        "projects",
        ["project_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_tasks_project_id", "tasks", ["project_id"], unique=False)

    op.add_column(
        "documents",
        sa.Column("project_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_documents_project_id",
        "documents",
        "projects",
        ["project_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_documents_project_id", "documents", ["project_id"], unique=False)


def downgrade() -> None:
    """Remove project_id from tasks and documents."""
    op.drop_index("ix_documents_project_id", table_name="documents")
    op.drop_constraint("fk_documents_project_id", "documents", type_="foreignkey")
    op.drop_column("documents", "project_id")

    op.drop_index("ix_tasks_project_id", table_name="tasks")
    op.drop_constraint("fk_tasks_project_id", "tasks", type_="foreignkey")
    op.drop_column("tasks", "project_id")
