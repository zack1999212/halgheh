"""standardize project invitations on usernames

Renames invited_email to invitee_username and backfills canonical usernames.

Revision ID: 020
Revises: 019
Create Date: 2026-11-18 20:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "020"
down_revision: Union[str, Sequence[str], None] = "019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Rename invited_email to invitee_username and preserve/canonicalize data."""
    conn = op.get_bind()

    # Inspect legacy values before migration changes. If any stored value is
    # email-formatted and does not correspond to the invitee's canonical
    # username, fail explicitly rather than silently reinterpreting it as a
    # username.
    rows = conn.execute(
        sa.text(
            """
            SELECT pi.id, pi.invitee_id, pi.invited_email, u.username
            FROM project_invitations pi
            LEFT JOIN users u ON u.id = pi.invitee_id
            WHERE position('@' in pi.invited_email) > 0
              AND (u.username IS NULL OR lower(pi.invited_email) <> lower(u.username))
            """
        )
    ).fetchall()
    if rows:
        raise RuntimeError(
            "Cannot safely migrate legacy email-formatted invitation identifiers "
            f"without username mapping for invitation ids: {[r[0] for r in rows]}"
        )

    op.alter_column(
        "project_invitations",
        "invited_email",
        new_column_name="invitee_username",
        existing_type=sa.String(length=255),
        existing_nullable=False,
    )

    # Preserve records and store canonical usernames from the authoritative
    # invitee relationship (handles case normalization and any safe legacy
    # values without silent email->username reinterpretation).
    op.execute(
        sa.text(
            """
            UPDATE project_invitations pi
            SET invitee_username = u.username
            FROM users u
            WHERE u.id = pi.invitee_id
              AND u.username IS NOT NULL
            """
        )
    )

    # Safety check: every invitation must still resolve to a canonical username.
    unresolved = conn.execute(
        sa.text(
            """
            SELECT pi.id
            FROM project_invitations pi
            LEFT JOIN users u ON u.id = pi.invitee_id
            WHERE u.username IS NULL OR pi.invitee_username IS DISTINCT FROM u.username
            """
        )
    ).fetchall()
    if unresolved:
        raise RuntimeError(
            "Invitation records could not be mapped to canonical usernames for "
            f"invitation ids: {[r[0] for r in unresolved]}"
        )


def downgrade() -> None:
    """Restore invited_email column name."""
    op.alter_column(
        "project_invitations",
        "invitee_username",
        new_column_name="invited_email",
        existing_type=sa.String(length=255),
        existing_nullable=False,
    )
