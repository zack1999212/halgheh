"""resource workspace associations

Revision ID: 030
Revises: 029
Create Date: 2026-05-15 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "030"
down_revision = "029"
branch_labels = None
depends_on = None


def _has_table(inspector, name: str) -> bool:
    return name in inspector.get_table_names()


def _has_column(inspector, table: str, column: str) -> bool:
    return any(c["name"] == column for c in inspector.get_columns(table))


def _has_index(inspector, table: str, name: str) -> bool:
    return any(i["name"] == name for i in inspector.get_indexes(table))


def _ensure_personal_workspace(bind, user_id: int) -> int:
    row = bind.execute(
        sa.text(
            """
            SELECT id FROM workspaces
            WHERE owner_id = :uid AND workspace_type = 'personal'
            LIMIT 1
            """
        ),
        {"uid": user_id},
    ).scalar()
    if row is not None:
        return int(row)
    username = bind.execute(
        sa.text("SELECT username FROM users WHERE id = :uid"),
        {"uid": user_id},
    ).scalar()
    name = f"{username}'s Workspace" if username else f"User {user_id} Workspace"
    return int(
        bind.execute(
            sa.text(
                """
                INSERT INTO workspaces (owner_id, name, description, workspace_type, created_at, updated_at)
                VALUES (:uid, :name, NULL, 'personal', now(), now())
                RETURNING id
                """
            ),
            {"uid": user_id, "name": name},
        ).scalar_one()
    )


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # --- task_workspaces ---
    if not _has_table(inspector, "task_workspaces"):
        op.create_table(
            "task_workspaces",
            sa.Column("task_id", sa.Integer(), sa.ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True, nullable=False),
            sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), primary_key=True, nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )
        op.create_index("ix_task_workspaces_task_id", "task_workspaces", ["task_id"])
        op.create_index("ix_task_workspaces_workspace_id", "task_workspaces", ["workspace_id"])

    # --- document_workspaces ---
    inspector = sa.inspect(bind)
    if not _has_table(inspector, "document_workspaces"):
        op.create_table(
            "document_workspaces",
            sa.Column("document_id", sa.Integer(), sa.ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True, nullable=False),
            sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), primary_key=True, nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )
        op.create_index("ix_document_workspaces_document_id", "document_workspaces", ["document_id"])
        op.create_index("ix_document_workspaces_workspace_id", "document_workspaces", ["workspace_id"])

    # --- event_workspaces ---
    inspector = sa.inspect(bind)
    if not _has_table(inspector, "event_workspaces"):
        op.create_table(
            "event_workspaces",
            sa.Column("event_id", sa.Integer(), sa.ForeignKey("events.id", ondelete="CASCADE"), primary_key=True, nullable=False),
            sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), primary_key=True, nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )
        op.create_index("ix_event_workspaces_event_id", "event_workspaces", ["event_id"])
        op.create_index("ix_event_workspaces_workspace_id", "event_workspaces", ["workspace_id"])

    # --- Backfill tasks ---
    inspector = sa.inspect(bind)
    if _has_table(inspector, "task_workspaces") and _has_table(inspector, "tasks"):
        task_rows = bind.execute(
            sa.text("SELECT id, created_by, project_id FROM tasks ORDER BY id")
        ).mappings().all()
        for task in task_rows:
            ws_ids: set[int] = set()
            if task["project_id"] is not None and _has_table(inspector, "projects"):
                pws = bind.execute(
                    sa.text("SELECT workspace_id FROM projects WHERE id = :pid"),
                    {"pid": task["project_id"]},
                ).scalar()
                if pws is not None:
                    ws_ids.add(int(pws))
            if not ws_ids:
                ws_ids.add(_ensure_personal_workspace(bind, int(task["created_by"])))
            for ws_id in ws_ids:
                bind.execute(
                    sa.text(
                        """
                        INSERT INTO task_workspaces (task_id, workspace_id, created_at)
                        VALUES (:tid, :wid, now())
                        ON CONFLICT DO NOTHING
                        """
                    ),
                    {"tid": task["id"], "wid": ws_id},
                )

    # --- Backfill documents ---
    inspector = sa.inspect(bind)
    if _has_table(inspector, "document_workspaces") and _has_table(inspector, "documents"):
        doc_rows = bind.execute(
            sa.text("SELECT id, workspace_id, owner_id, project_id FROM documents ORDER BY id")
        ).mappings().all()
        for doc in doc_rows:
            ws_ids: set[int] = set()
            if doc["workspace_id"] is not None:
                ws_ids.add(int(doc["workspace_id"]))
            if doc["project_id"] is not None and _has_table(inspector, "projects"):
                pws = bind.execute(
                    sa.text("SELECT workspace_id FROM projects WHERE id = :pid"),
                    {"pid": doc["project_id"]},
                ).scalar()
                if pws is not None:
                    ws_ids.add(int(pws))
            if not ws_ids:
                ws_ids.add(_ensure_personal_workspace(bind, int(doc["owner_id"])))
            for ws_id in ws_ids:
                bind.execute(
                    sa.text(
                        """
                        INSERT INTO document_workspaces (document_id, workspace_id, created_at)
                        VALUES (:did, :wid, now())
                        ON CONFLICT DO NOTHING
                        """
                    ),
                    {"did": doc["id"], "wid": ws_id},
                )

    # --- Backfill calendar events ---
    inspector = sa.inspect(bind)
    if _has_table(inspector, "event_workspaces") and _has_table(inspector, "events"):
        event_rows = bind.execute(
            sa.text(
                """
                SELECT e.id, e.calendar_id, e.project_id, c.user_id AS calendar_owner_id
                FROM events e
                JOIN calendars c ON c.id = e.calendar_id
                ORDER BY e.id
                """
            )
        ).mappings().all()
        for ev in event_rows:
            ws_ids: set[int] = set()
            # Personal calendar ownership -> owner's personal workspace
            if ev["calendar_owner_id"] is not None:
                ws_ids.add(_ensure_personal_workspace(bind, int(ev["calendar_owner_id"])))
            if ev["project_id"] is not None and _has_table(inspector, "projects"):
                pws = bind.execute(
                    sa.text("SELECT workspace_id FROM projects WHERE id = :pid"),
                    {"pid": ev["project_id"]},
                ).scalar()
                if pws is not None:
                    ws_ids.add(int(pws))
            if not ws_ids:
                # Should not happen because calendar has owner; defensive.
                continue
            for ws_id in ws_ids:
                bind.execute(
                    sa.text(
                        """
                        INSERT INTO event_workspaces (event_id, workspace_id, created_at)
                        VALUES (:eid, :wid, now())
                        ON CONFLICT DO NOTHING
                        """
                    ),
                    {"eid": ev["id"], "wid": ws_id},
                )

    # --- Integrity checks ---
    inspector = sa.inspect(bind)
    if _has_table(inspector, "task_workspaces") and _has_table(inspector, "tasks"):
        missing_tasks = bind.execute(
            sa.text(
                """
                SELECT COUNT(*) FROM tasks t
                WHERE NOT EXISTS (SELECT 1 FROM task_workspaces tw WHERE tw.task_id = t.id)
                """
            )
        ).scalar_one()
        if int(missing_tasks) > 0:
            raise RuntimeError(f"Backfill integrity failure: {missing_tasks} tasks have no workspace association")

    if _has_table(inspector, "document_workspaces") and _has_table(inspector, "documents"):
        missing_docs = bind.execute(
            sa.text(
                """
                SELECT COUNT(*) FROM documents d
                WHERE NOT EXISTS (SELECT 1 FROM document_workspaces dw WHERE dw.document_id = d.id)
                """
            )
        ).scalar_one()
        if int(missing_docs) > 0:
            raise RuntimeError(f"Backfill integrity failure: {missing_docs} documents have no workspace association")

    if _has_table(inspector, "event_workspaces") and _has_table(inspector, "events"):
        missing_events = bind.execute(
            sa.text(
                """
                SELECT COUNT(*) FROM events e
                WHERE NOT EXISTS (SELECT 1 FROM event_workspaces ew WHERE ew.event_id = e.id)
                """
            )
        ).scalar_one()
        if int(missing_events) > 0:
            raise RuntimeError(f"Backfill integrity failure: {missing_events} events have no workspace association")


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    for table, idxs in [
        ("event_workspaces", ["ix_event_workspaces_workspace_id", "ix_event_workspaces_event_id"]),
        ("document_workspaces", ["ix_document_workspaces_workspace_id", "ix_document_workspaces_document_id"]),
        ("task_workspaces", ["ix_task_workspaces_workspace_id", "ix_task_workspaces_task_id"]),
    ]:
        inspector = sa.inspect(bind)
        if _has_table(inspector, table):
            for idx in idxs:
                if _has_index(inspector, table, idx):
                    op.drop_index(idx, table_name=table)
            op.drop_table(table)
