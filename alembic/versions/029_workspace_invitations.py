"""workspace invitations and membership management

Revision ID: 029
Revises: 028
Create Date: 2026-05-15 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "029"
down_revision = "028"
branch_labels = None
depends_on = None


def _has_table(inspector, name: str) -> bool:
    return name in inspector.get_table_names()


def _has_column(inspector, table: str, column: str) -> bool:
    return any(c["name"] == column for c in inspector.get_columns(table))


def _has_index(inspector, table: str, name: str) -> bool:
    return any(i["name"] == name for i in inspector.get_indexes(table))


def _has_fk(inspector, table: str, name: str) -> bool:
    return any(fk.get("name") == name for fk in inspector.get_foreign_keys(table))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not _has_table(inspector, "workspace_invitations"):
        op.create_table(
            "workspace_invitations",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
            sa.Column("inviter_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("invitee_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("invitee_username", sa.String(length=255), nullable=False),
            sa.Column("role", sa.String(length=16), nullable=False),
            sa.Column("status", sa.String(length=16), nullable=False, server_default=sa.text("'pending'")),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
            sa.CheckConstraint("status IN ('pending', 'accepted', 'declined', 'revoked', 'expired')", name="ck_workspace_invitations_status"),
            sa.CheckConstraint("role IN ('admin', 'editor', 'viewer')", name="ck_workspace_invitations_role"),
        )
        op.create_index("ix_workspace_invitations_workspace_id", "workspace_invitations", ["workspace_id"])
        op.create_index("ix_workspace_invitations_inviter_id", "workspace_invitations", ["inviter_id"])
        op.create_index("ix_workspace_invitations_invitee_id", "workspace_invitations", ["invitee_id"])
        op.create_index("ix_workspace_invitations_status", "workspace_invitations", ["status"])
        op.execute(
            sa.text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS uq_workspace_invitations_pending_workspace_invitee
                ON workspace_invitations (workspace_id, invitee_id)
                WHERE status = 'pending'
                """
            )
        )

    inspector = sa.inspect(bind)
    if _has_table(inspector, "project_invitations") and not _has_column(inspector, "project_invitations", "workspace_invitation_id"):
        op.add_column("project_invitations", sa.Column("workspace_invitation_id", sa.Integer(), nullable=True))
    inspector = sa.inspect(bind)
    if _has_table(inspector, "project_invitations"):
        if not _has_fk(inspector, "project_invitations", "fk_project_invitations_workspace_invitation_id"):
            op.create_foreign_key(
                "fk_project_invitations_workspace_invitation_id",
                "project_invitations",
                "workspace_invitations",
                ["workspace_invitation_id"],
                ["id"],
                ondelete="SET NULL",
            )
        if not _has_index(inspector, "project_invitations", "ix_project_invitations_workspace_invitation_id"):
            op.create_index("ix_project_invitations_workspace_invitation_id", "project_invitations", ["workspace_invitation_id"])

    # Backfill legacy project invitations into canonical workspace invitations.
    inspector = sa.inspect(bind)
    if _has_table(inspector, "project_invitations") and _has_table(inspector, "workspace_invitations") and _has_table(inspector, "projects"):
        rows = bind.execute(
            sa.text(
                """
                SELECT pi.id, p.workspace_id, pi.inviter_id, pi.invitee_id, pi.invitee_username,
                       pi.role, pi.status, pi.created_at, pi.expires_at, pi.responded_at, pi.revoked_at
                FROM project_invitations pi
                JOIN projects p ON p.id = pi.project_id
                WHERE pi.workspace_invitation_id IS NULL
                  AND p.workspace_id IS NOT NULL
                ORDER BY pi.id
                """
            )
        ).mappings().all()
        for row in rows:
            ws_inv_id = bind.execute(
                sa.text(
                    """
                    INSERT INTO workspace_invitations
                        (workspace_id, inviter_id, invitee_id, invitee_username, role, status, created_at, expires_at, responded_at, revoked_at)
                    VALUES
                        (:workspace_id, :inviter_id, :invitee_id, :invitee_username, :role, :status, :created_at, :expires_at, :responded_at, :revoked_at)
                    RETURNING id
                    """
                ),
                dict(row),
            ).scalar_one()
            bind.execute(
                sa.text("UPDATE project_invitations SET workspace_invitation_id = :wsid WHERE id = :pid"),
                {"wsid": ws_inv_id, "pid": row["id"]},
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _has_table(inspector, "project_invitations") and _has_column(inspector, "project_invitations", "workspace_invitation_id"):
        if _has_fk(inspector, "project_invitations", "fk_project_invitations_workspace_invitation_id"):
            op.drop_constraint("fk_project_invitations_workspace_invitation_id", "project_invitations", type_="foreignkey")
        if _has_index(inspector, "project_invitations", "ix_project_invitations_workspace_invitation_id"):
            op.drop_index("ix_project_invitations_workspace_invitation_id", table_name="project_invitations")
        op.drop_column("project_invitations", "workspace_invitation_id")

    inspector = sa.inspect(bind)
    if _has_table(inspector, "workspace_invitations"):
        op.execute(sa.text("DROP INDEX IF EXISTS uq_workspace_invitations_pending_workspace_invitee"))
        op.drop_index("ix_workspace_invitations_status", table_name="workspace_invitations")
        op.drop_index("ix_workspace_invitations_invitee_id", table_name="workspace_invitations")
        op.drop_index("ix_workspace_invitations_inviter_id", table_name="workspace_invitations")
        op.drop_index("ix_workspace_invitations_workspace_id", table_name="workspace_invitations")
        op.drop_table("workspace_invitations")
