"""Development-only cleanup for the Unified Workspace Foundation phase.

This script deletes application records while preserving user accounts and
Alembic migration history. It must NEVER be run against production.

Usage:
  APP_ENV=development DATABASE_URL=... python scripts/dev_cleanup_workspace_foundation.py --confirm-dev

What is preserved:
- users table and credentials
- alembic_version migration history
- database schema

What is removed:
- application records (projects, memberships, invitations, tasks, documents,
  calendars/events/reminders, discussions, activities, notifications, workspaces,
  and dependent records)
- local uploaded document/avatar files are NOT automatically deleted by this
  script; report them for manual review.

After cleanup, a Personal Workspace is ensured for every existing user.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from sqlalchemy import create_engine, text


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from service.core.database import DATABASE_URL  # noqa: E402


PROD_MARKERS = {"production", "prod"}


def _assert_dev(confirm_dev: bool) -> None:
    if not confirm_dev:
        raise SystemExit("Refusing to run without --confirm-dev")
    app_env = (os.getenv("APP_ENV") or os.getenv("ENVIRONMENT") or "").lower().strip()
    if app_env in PROD_MARKERS:
        raise SystemExit(f"Refusing to run in APP_ENV/ENVIRONMENT={app_env!r}")
    db_url = os.getenv("DATABASE_URL", DATABASE_URL)
    lowered = db_url.lower()
    if "prod" in lowered or "production" in lowered:
        raise SystemExit("Refusing to run because DATABASE_URL looks production-like")


def _table_exists(conn, name: str) -> bool:
    row = conn.execute(
        text(
            """
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = :name
            )
            """
        ),
        {"name": name},
    ).scalar_one()
    return bool(row)


def main() -> int:
    parser = argparse.ArgumentParser(description="Dev-only app data cleanup")
    parser.add_argument("--confirm-dev", action="store_true", help="Required safety flag")
    args = parser.parse_args()
    _assert_dev(args.confirm_dev)

    db_url = os.getenv("DATABASE_URL", DATABASE_URL)
    engine = create_engine(db_url, pool_pre_ping=True)

    # Delete in dependency-safe order. Keep users and alembic_version.
    delete_tables = [
        # notifications / scheduling
        "notification_deliveries",
        "notifications",
        "scheduled_reminders",
        "reminders",
        # calendar
        "calendar_event_comments",
        "event_exceptions",
        "events",
        "calendars",
        # discussions
        "project_discussion_reactions",
        "project_discussion_replies",
        "project_discussions",
        # tasks
        "task_label_assignments",
        "task_comments",
        "task_assignments",
        "task_activities",
        "tasks",
        "task_labels",
        # docs
        "document_links",
        "document_permissions",
        "document_favorites",
        "document_tags",
        "document_versions",
        "documents",
        "folders",
        "tags",
        # projects
        "project_activities",
        "project_milestone_steps",
        "project_milestones",
        "project_invitations",
        "project_members",
        "projects",
        # workspace foundation
        "workspace_members",
        "workspaces",
        # agent / ai / share / misc app data (safe to clear in dev)
        "agent_messages",
        "agent_conversations",
        "ai_provider_credentials",
        "ai_provider_configs",
        "share_links",
    ]

    removed = {}
    preserved = []
    with engine.begin() as conn:
        for table in delete_tables:
            if _table_exists(conn, table):
                count = conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar_one()
                conn.execute(text(f"DELETE FROM {table}"))
                removed[table] = int(count)
            else:
                removed[table] = "missing"

        # Preserve users and alembic_version explicitly
        if _table_exists(conn, "users"):
            preserved.append(f"users={conn.execute(text('SELECT COUNT(*) FROM users')).scalar_one()}")
        if _table_exists(conn, "alembic_version"):
            preserved.append("alembic_version")

        # Ensure personal workspace for every existing user
        if _table_exists(conn, "users") and _table_exists(conn, "workspaces"):
            conn.execute(
                text(
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

    print("Development cleanup complete.")
    print("Preserved:", ", ".join(preserved))
    print("Removed:")
    for table, value in removed.items():
        print(f"  - {table}: {value}")
    print("Note: uploaded files in service/uploads were not deleted by this script; review manually if needed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
