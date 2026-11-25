"""auth hardening: email, token revocation, normalized usernames

Adds email/verification fields and a token_version counter to users, creates
the auth_tokens table for rotating refresh and single-use reset/verify tokens,
and normalizes all existing usernames to lowercase.

Revision ID: 035
Revises: 034
Create Date: 2026-11-25 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "035"
down_revision: Union[str, Sequence[str], None] = "034"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("email", sa.String(length=255), nullable=True))
    op.add_column(
        "users", sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "users",
        sa.Column(
            "token_version",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )

    conn = op.get_bind()
    seen: set[str] = set()
    for user_id, raw_username in conn.execute(
        sa.text("SELECT id, username FROM users ORDER BY id")
    ).all():
        normalized = (raw_username or "").strip().lower() or f"user{user_id}"
        if normalized in seen:
            normalized = f"{normalized}-{user_id}"
        seen.add(normalized)
        conn.execute(
            sa.text("UPDATE users SET username = :name WHERE id = :uid"),
            {"name": normalized, "uid": user_id},
        )
        conn.execute(
            sa.text("UPDATE users SET email = :email WHERE id = :uid"),
            {"email": f"user{user_id}@placeholder.halgheh.local", "uid": user_id},
        )

    op.alter_column("users", "email", nullable=False)
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "auth_tokens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("type", sa.String(length=16), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("token_hash", name="uq_auth_tokens_token_hash"),
    )
    op.create_index("ix_auth_tokens_user_id", "auth_tokens", ["user_id"])
    op.create_index("ix_auth_tokens_user_type", "auth_tokens", ["user_id", "type"])


def downgrade() -> None:
    op.drop_index("ix_auth_tokens_user_type", table_name="auth_tokens")
    op.drop_index("ix_auth_tokens_user_id", table_name="auth_tokens")
    op.drop_table("auth_tokens")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_column("users", "token_version")
    op.drop_column("users", "email_verified_at")
    op.drop_column("users", "email")
