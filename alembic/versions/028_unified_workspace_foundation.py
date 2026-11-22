"""unified workspace foundation

Revision ID: 028
Revises: 027
Create Date: 2026-05-15 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "028"
down_revision = "027"
branch_labels = None
depends_on = None

WORKSPACE_TYPE_PERSONAL = "personal"
WORKSPACE_TYPE_SHARED = "shared"
PERSONAL_NAME_SUFFIX = "'s Workspace"


def _has_table(inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _has_column(inspector, table_name: str, column_name: str) -> bool:
    return any(col["name"] == column_name for col in inspector.get_columns(table_name))


def _has_index(inspector, table_name: str, index_name: str) -> bool:
    return any(ix["name"] == index_name for ix in inspector.get_indexes(table_name))


def _has_unique_constraint(inspector, table_name: str, constraint_name: str) -> bool:
    return any(c["name"] == constraint_name for c in inspector.get_unique_constraints(table_name))


def _has_fk(inspector, table_name: str, fk_name: str) -> bool:
    return any(fk.get("name") == fk_name for fk in inspector.get_foreign_keys(table_name))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # --- workspaces: canonical workspace fields ---
    if _has_table(inspector, "workspaces"):
        with op.batch_alter_table("workspaces") as batch_op:
            batch_op.alter_column("name", existing_type=sa.String(length=128), type_=sa.String(length=200), existing_nullable=False)

        inspector = sa.inspect(bind)
        if not _has_column(inspector, "workspaces", "workspace_type"):
            op.add_column(
                "workspaces",
                sa.Column(
                    "workspace_type",
                    sa.String(length=16),
                    nullable=False,
                    server_default=sa.text("'personal'"),
                ),
            )
        inspector = sa.inspect(bind)
        if not _has_index(inspector, "workspaces", "ix_workspaces_workspace_type"):
            op.create_index("ix_workspaces_workspace_type", "workspaces", ["workspace_type"])

        # Deduplicate personal workspaces per owner before adding unique partial index.
        # Keep earliest workspace as personal; convert extras to shared (owner-only) to preserve data.
        bind.execute(
            sa.text(
                """
                WITH ranked AS (
                    SELECT id, owner_id,
                           ROW_NUMBER() OVER (PARTITION BY owner_id ORDER BY created_at ASC, id ASC) AS rn
                    FROM workspaces
                    WHERE workspace_type = 'personal'
                )
                UPDATE workspaces
                SET workspace_type = 'shared'
                WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
                """
            )
        )

        inspector = sa.inspect(bind)
        op.execute(
            sa.text(
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint WHERE conname = 'ck_workspaces_workspace_type'
                    ) THEN
                        ALTER TABLE workspaces
                        ADD CONSTRAINT ck_workspaces_workspace_type
                        CHECK (workspace_type IN ('personal', 'shared'));
                    END IF;
                END $$;
                """
            )
        )
        op.execute(
            sa.text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS uq_workspaces_personal_owner
                ON workspaces (owner_id)
                WHERE workspace_type = 'personal'
                """
            )
        )

    # --- projects: link to canonical shared workspace ---
    inspector = sa.inspect(bind)
    if _has_table(inspector, "projects") and not _has_column(inspector, "projects", "workspace_id"):
        op.add_column(
            "projects",
            sa.Column("workspace_id", sa.Integer(), nullable=True),
        )
    inspector = sa.inspect(bind)
    if _has_table(inspector, "projects"):
        if not _has_fk(inspector, "projects", "fk_projects_workspace_id_workspaces"):
            op.create_foreign_key(
                "fk_projects_workspace_id_workspaces",
                "projects",
                "workspaces",
                ["workspace_id"],
                ["id"],
                ondelete="SET NULL",
            )
        if not _has_index(inspector, "projects", "uq_projects_workspace_id"):
            # unique index for one-to-one project<->workspace link
            op.execute(
                sa.text(
                    """
                    CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_workspace_id
                    ON projects (workspace_id)
                    WHERE workspace_id IS NOT NULL
                    """
                )
            )

    # --- workspace_members: canonical membership ---
    inspector = sa.inspect(bind)
    if not _has_table(inspector, "workspace_members"):
        op.create_table(
            "workspace_members",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("role", sa.String(length=16), nullable=False),
            sa.Column("joined_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.CheckConstraint("role IN ('admin', 'editor', 'viewer')", name="ck_workspace_members_role"),
            sa.UniqueConstraint("workspace_id", "user_id", name="uq_workspace_members_workspace_user"),
        )
        op.create_index("ix_workspace_members_workspace_id", "workspace_members", ["workspace_id"])
        op.create_index("ix_workspace_members_user_id", "workspace_members", ["user_id"])

    # --- backfill: projects -> shared workspaces ---
    inspector = sa.inspect(bind)
    if _has_table(inspector, "projects") and _has_table(inspector, "workspaces"):
        rows = bind.execute(
            sa.text(
                """
                SELECT id, owner_id, name, description, created_at, updated_at
                FROM projects
                WHERE workspace_id IS NULL
                ORDER BY id
                """
            )
        ).mappings().all()
        for row in rows:
            ws_id = bind.execute(
                sa.text(
                    """
                    INSERT INTO workspaces (owner_id, name, description, workspace_type, created_at, updated_at)
                    VALUES (:owner_id, :name, :description, 'shared', :created_at, :updated_at)
                    RETURNING id
                    """
                ),
                {
                    "owner_id": row["owner_id"],
                    "name": (row["name"] or "")[:200],
                    "description": row["description"],
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"],
                },
            ).scalar_one()
            bind.execute(
                sa.text("UPDATE projects SET workspace_id = :ws_id WHERE id = :pid AND workspace_id IS NULL"),
                {"ws_id": ws_id, "pid": row["id"]},
            )

    # --- backfill: project_members -> workspace_members ---
    inspector = sa.inspect(bind)
    if _has_table(inspector, "project_members") and _has_table(inspector, "workspace_members") and _has_table(inspector, "projects"):
        bind.execute(
            sa.text(
                """
                INSERT INTO workspace_members (workspace_id, user_id, role, joined_at, created_at, updated_at)
                SELECT p.workspace_id, pm.user_id, pm.role, pm.joined_at, pm.created_at, pm.updated_at
                FROM project_members pm
                JOIN projects p ON p.id = pm.project_id
                WHERE p.workspace_id IS NOT NULL
                ON CONFLICT (workspace_id, user_id) DO NOTHING
                """
            )
        )

    # --- backfill: personal workspaces for existing users missing one ---
    inspector = sa.inspect(bind)
    if _has_table(inspector, "users") and _has_table(inspector, "workspaces"):
        bind.execute(
            sa.text(
                """
                INSERT INTO workspaces (owner_id, name, description, workspace_type, created_at, updated_at)
                SELECT u.id,
                       LEFT(COALESCE(NULLIF(u.username, ''), 'User') || '''s Workspace', 200),
                       NULL,
                       'personal',
                       COALESCE(u.created_at, now()),
                       now()
                FROM users u
                WHERE NOT EXISTS (
                    SELECT 1 FROM workspaces w
                    WHERE w.owner_id = u.id AND w.workspace_type = 'personal'
                )
                """
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _has_table(inspector, "workspace_members"):
        op.drop_index("ix_workspace_members_user_id", table_name="workspace_members")
        op.drop_index("ix_workspace_members_workspace_id", table_name="workspace_members")
        op.drop_table("workspace_members")

    inspector = sa.inspect(bind)
    if _has_table(inspector, "projects") and _has_column(inspector, "projects", "workspace_id"):
        op.execute(sa.text("DROP INDEX IF EXISTS uq_projects_workspace_id"))
        if _has_fk(inspector, "projects", "fk_projects_workspace_id_workspaces"):
            op.drop_constraint("fk_projects_workspace_id_workspaces", "projects", type_="foreignkey")
        op.drop_column("projects", "workspace_id")

    inspector = sa.inspect(bind)
    if _has_table(inspector, "workspaces"):
        op.execute(sa.text("DROP INDEX IF EXISTS uq_workspaces_personal_owner"))
        op.execute(sa.text("ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS ck_workspaces_workspace_type"))
        if _has_index(inspector, "workspaces", "ix_workspaces_workspace_type"):
            op.drop_index("ix_workspaces_workspace_type", table_name="workspaces")
        if _has_column(inspector, "workspaces", "workspace_type"):
            op.drop_column("workspaces", "workspace_type")
        with op.batch_alter_table("workspaces") as batch_op:
            batch_op.alter_column("name", existing_type=sa.String(length=200), type_=sa.String(length=128), existing_nullable=False)
