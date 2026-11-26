"""replace project milestones with workspace milestones

Workspace milestones own ordered steps; each step links tasks through
milestone_step_tasks and derives completion from those tasks. The project
milestone tables and manual step completion flags are removed.

Revision ID: 033
Revises: 027
Create Date: 2026-11-25 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "033"
down_revision: Union[str, Sequence[str], None] = "032"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _create_new_tables() -> None:
    op.create_table(
        "milestones",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.String(length=16),
            server_default=sa.text("'pending'"),
            nullable=False,
        ),
        sa.Column("position", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=False),
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
            "status IN ('pending', 'in_progress', 'completed')",
            name="ck_milestones_status",
        ),
        sa.CheckConstraint("length(title) > 0", name="ck_milestones_title_not_empty"),
        sa.CheckConstraint(
            "(status = 'completed' AND completed_at IS NOT NULL) OR "
            "(status != 'completed' AND completed_at IS NULL)",
            name="ck_milestones_completed_state",
        ),
        sa.CheckConstraint("position >= 0", name="ck_milestones_position_nonneg"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_milestones_workspace_id", "milestones", ["workspace_id"])
    op.create_index(
        "ix_milestones_workspace_due_date", "milestones", ["workspace_id", "due_date"]
    )
    op.create_index(
        "ix_milestones_workspace_position", "milestones", ["workspace_id", "position"]
    )

    op.create_table(
        "milestone_steps",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("milestone_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default=sa.text("0")),
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
        sa.CheckConstraint("length(title) > 0", name="ck_milestone_steps_title_not_empty"),
        sa.CheckConstraint("position >= 0", name="ck_milestone_steps_position_nonneg"),
        sa.ForeignKeyConstraint(["milestone_id"], ["milestones.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_milestone_steps_milestone_id", "milestone_steps", ["milestone_id"])
    op.create_index(
        "ix_milestone_steps_milestone_position",
        "milestone_steps",
        ["milestone_id", "position"],
    )

    op.create_table(
        "milestone_step_tasks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("step_id", sa.Integer(), nullable=False),
        sa.Column("task_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["step_id"], ["milestone_steps.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("step_id", "task_id", name="uq_milestone_step_tasks_step_task"),
    )
    op.create_index("ix_milestone_step_tasks_step_id", "milestone_step_tasks", ["step_id"])
    op.create_index("ix_milestone_step_tasks_task_id", "milestone_step_tasks", ["task_id"])


def _create_old_tables() -> None:
    op.create_table(
        "project_milestones",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.String(length=16),
            server_default=sa.text("'pending'"),
            nullable=False,
        ),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=False),
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
        sa.Column("position", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.CheckConstraint(
            "status IN ('pending', 'in_progress', 'completed', 'cancelled')",
            name="ck_project_milestones_status",
        ),
        sa.CheckConstraint(
            "length(title) > 0", name="ck_project_milestones_title_not_empty"
        ),
        sa.CheckConstraint(
            "(status = 'completed' AND completed_at IS NOT NULL) OR "
            "(status != 'completed' AND completed_at IS NULL)",
            name="ck_project_milestones_completed_state",
        ),
        sa.CheckConstraint("position >= 0", name="ck_project_milestones_position_nonneg"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_project_milestones_project_id", "project_milestones", ["project_id"])
    op.create_index(
        "ix_project_milestones_project_due_date", "project_milestones", ["project_id", "due_date"]
    )
    op.create_index(
        "ix_project_milestones_project_position", "project_milestones", ["project_id", "position"]
    )

    op.create_table(
        "project_milestone_steps",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("milestone_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column(
            "is_completed", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
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
            "length(title) > 0", name="ck_project_milestone_steps_title_not_empty"
        ),
        sa.CheckConstraint("position >= 0", name="ck_project_milestone_steps_position_nonneg"),
        sa.CheckConstraint(
            "(is_completed = TRUE AND completed_at IS NOT NULL) OR "
            "(is_completed = FALSE AND completed_at IS NULL)",
            name="ck_project_milestone_steps_completed_state",
        ),
        sa.ForeignKeyConstraint(
            ["milestone_id"], ["project_milestones.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_project_milestone_steps_milestone_id", "project_milestone_steps", ["milestone_id"]
    )
    op.create_index(
        "ix_project_milestone_steps_milestone_position",
        "project_milestone_steps",
        ["milestone_id", "position"],
    )


def upgrade() -> None:
    _create_new_tables()

    # Preserve existing milestones where the parent project has a workspace.
    op.execute(
        sa.text(
            """
            INSERT INTO milestones
                (id, workspace_id, title, description, status, position,
                 due_date, completed_at, created_by, created_at, updated_at)
            SELECT m.id, p.workspace_id, m.title, m.description, m.status, m.position,
                   m.due_date, m.completed_at, m.created_by, m.created_at, m.updated_at
            FROM project_milestones AS m
            JOIN projects AS p ON p.id = m.project_id
            WHERE p.workspace_id IS NOT NULL
              AND m.status IN ('pending', 'in_progress', 'completed')
            """
        )
    )
    op.execute(
        sa.text(
            """
            INSERT INTO milestone_steps
                (id, milestone_id, title, description, position, created_at, updated_at)
            SELECT s.id, s.milestone_id, s.title, s.description, s.position,
                   s.created_at, s.updated_at
            FROM project_milestone_steps AS s
            WHERE s.milestone_id IN (SELECT id FROM milestones)
            """
        )
    )
    for table in ("milestones", "milestone_steps"):
        op.execute(
            sa.text(
                f"""
                SELECT setval(pg_get_serial_sequence('{table}', 'id'),
                              GREATEST(COALESCE((SELECT MAX(id) FROM {table}), 0), 1))
                """
            )
        )

    op.drop_table("project_milestone_steps")
    op.drop_table("project_milestones")


def downgrade() -> None:
    _create_old_tables()
    op.execute(
        sa.text(
            """
            INSERT INTO project_milestones
                (id, project_id, title, description, status, position,
                 due_date, completed_at, created_by, created_at, updated_at)
            SELECT m.id,
                   (SELECT p.id FROM projects AS p
                    WHERE p.workspace_id = m.workspace_id ORDER BY p.id LIMIT 1),
                   m.title, m.description, m.status, m.position, m.due_date,
                   m.completed_at, m.created_by, m.created_at, m.updated_at
            FROM milestones AS m
            WHERE EXISTS (SELECT 1 FROM projects AS p WHERE p.workspace_id = m.workspace_id)
            """
        )
    )
    op.execute(
        sa.text(
            """
            INSERT INTO project_milestone_steps
                (id, milestone_id, title, description, position,
                 is_completed, completed_at, created_at, updated_at)
            SELECT s.id, s.milestone_id, s.title, s.description, s.position,
                   FALSE, NULL, s.created_at, s.updated_at
            FROM milestone_steps AS s
            WHERE s.milestone_id IN (SELECT id FROM project_milestones)
            """
        )
    )
    for table in ("project_milestones", "project_milestone_steps"):
        op.execute(
            sa.text(
                f"""
                SELECT setval(pg_get_serial_sequence('{table}', 'id'),
                              GREATEST(COALESCE((SELECT MAX(id) FROM {table}), 0), 1))
                """
            )
        )

    op.drop_table("milestone_step_tasks")
    op.drop_table("milestone_steps")
    op.drop_table("milestones")
