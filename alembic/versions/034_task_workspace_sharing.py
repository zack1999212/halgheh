"""task workspace sharing

Revision ID: 034_task_workspace_sharing
Revises: 033_merge_heads
Create Date: 2026-11-25 00:00:00.000000

Extends the canonical task_workspaces association with sharing metadata:
an explicit original-workspace flag, a viewer/editor permission level, and the
user who shared the task. Existing associations are preserved and backfilled.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "034_task_workspace_sharing"
down_revision = "033_merge_heads"
branch_labels = None
depends_on = None


def _has_table(inspector, name: str) -> bool:
    return name in inspector.get_table_names()


def _has_column(inspector, table: str, column: str) -> bool:
    return any(c["name"] == column for c in inspector.get_columns(table))


def _has_index(inspector, table: str, name: str) -> bool:
    return any(i["name"] == name for i in inspector.get_indexes(table))


def _has_check_constraint(inspector, table: str, name: str) -> bool:
    return any(c["name"] == name for c in inspector.get_check_constraints(table))


def _resolve_original_workspace(bind, inspector) -> dict[int, int]:
    """Determine the original workspace for every task without guessing.

    Evidence, in priority order:
      1. project.workspace_id when the task belongs to a project and that
         workspace is associated (the create path always resolves it first);
      2. the workspace recorded on the single ``task.created`` activity row;
      3. the task's only workspace association.

    If evidence conflicts or is missing, the migration stops with the exact
    affected task IDs instead of silently choosing a workspace.
    """
    tasks = bind.execute(
        sa.text("SELECT id, project_id FROM tasks ORDER BY id")
    ).mappings().all()
    projects_have_workspace = (
        _has_table(inspector, "projects")
        and _has_column(inspector, "projects", "workspace_id")
    )
    activities_have_workspace = (
        _has_table(inspector, "project_activities")
        and _has_column(inspector, "project_activities", "workspace_id")
    )

    original: dict[int, int] = {}
    ambiguous: list[str] = []
    for task in tasks:
        task_id = int(task["id"])
        associated = {
            int(row[0])
            for row in bind.execute(
                sa.text("SELECT workspace_id FROM task_workspaces WHERE task_id = :tid"),
                {"tid": task_id},
            )
        }
        if not associated:
            ambiguous.append(f"task {task_id}: no workspace association")
            continue

        candidates: set[int] = set()
        project_ws = None
        if projects_have_workspace and task["project_id"] is not None:
            project_ws = bind.execute(
                sa.text("SELECT workspace_id FROM projects WHERE id = :pid"),
                {"pid": task["project_id"]},
            ).scalar()
            if project_ws is not None and int(project_ws) in associated:
                candidates.add(int(project_ws))

        creation_ws: set[int] = set()
        if activities_have_workspace:
            creation_ws = {
                int(row[0])
                for row in bind.execute(
                    sa.text(
                        """
                        SELECT DISTINCT workspace_id
                        FROM project_activities
                        WHERE entity_type = 'task'
                          AND entity_id = :tid
                          AND event_type = 'task.created'
                          AND workspace_id IS NOT NULL
                        """
                    ),
                    {"tid": task_id},
                )
                if int(row[0]) in associated
            }

        if project_ws is not None and int(project_ws) in associated:
            if creation_ws and creation_ws != {int(project_ws)}:
                ambiguous.append(
                    f"task {task_id}: project workspace {int(project_ws)} conflicts "
                    f"with creation activity workspaces {sorted(creation_ws)}"
                )
                continue
            original[task_id] = int(project_ws)
        elif len(creation_ws) == 1:
            original[task_id] = next(iter(creation_ws))
        elif len(associated) == 1:
            original[task_id] = next(iter(associated))
        else:
            ambiguous.append(
                f"task {task_id}: cannot identify original workspace from "
                f"associations {sorted(associated)}"
            )

    if ambiguous:
        raise RuntimeError(
            "Ambiguous original workspace; migration stopped: " + "; ".join(ambiguous)
        )
    return original


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not _has_table(inspector, "task_workspaces"):
        return

    if not _has_column(inspector, "task_workspaces", "is_original"):
        op.add_column(
            "task_workspaces",
            sa.Column(
                "is_original",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
            ),
        )
    if not _has_column(inspector, "task_workspaces", "permission_level"):
        op.add_column(
            "task_workspaces",
            sa.Column(
                "permission_level",
                sa.String(16),
                nullable=False,
                server_default=sa.text("'viewer'"),
            ),
        )
    if not _has_column(inspector, "task_workspaces", "shared_by_user_id"):
        op.add_column(
            "task_workspaces",
            sa.Column(
                "shared_by_user_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )
    # created_at already exists on task_workspaces since revision 030.

    original_map = _resolve_original_workspace(bind, inspector)
    for task_id, workspace_id in original_map.items():
        bind.execute(
            sa.text(
                """
                UPDATE task_workspaces
                SET is_original = (workspace_id = :wid),
                    permission_level = CASE WHEN workspace_id = :wid THEN 'editor' ELSE 'viewer' END,
                    shared_by_user_id = NULL
                WHERE task_id = :tid
                """
            ),
            {"tid": task_id, "wid": workspace_id},
        )

    bad = bind.execute(
        sa.text(
            """
            SELECT task_id
            FROM task_workspaces
            WHERE is_original
            GROUP BY task_id
            HAVING count(*) <> 1
            """
        )
    ).scalars().all()
    if bad:
        raise RuntimeError(
            "Backfill did not produce exactly one original workspace for tasks: "
            + ", ".join(str(int(tid)) for tid in bad)
        )

    inspector = sa.inspect(bind)
    if not _has_check_constraint(
        inspector, "task_workspaces", "ck_task_workspaces_permission_level"
    ):
        op.create_check_constraint(
            "ck_task_workspaces_permission_level",
            "task_workspaces",
            "permission_level IN ('viewer', 'editor')",
        )
    if not _has_index(inspector, "task_workspaces", "ix_task_workspaces_shared_by_user_id"):
        op.create_index(
            "ix_task_workspaces_shared_by_user_id",
            "task_workspaces",
            ["shared_by_user_id"],
        )
    if not _has_index(inspector, "task_workspaces", "uq_task_workspaces_original_task"):
        op.create_index(
            "uq_task_workspaces_original_task",
            "task_workspaces",
            ["task_id"],
            unique=True,
            postgresql_where=sa.text("is_original"),
        )


def downgrade() -> None:
    # Forward-only foundation migration. No automatic downgrade is provided.
    pass
