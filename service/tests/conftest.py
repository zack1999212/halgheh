"""Shared fixtures for database-backed tests.

The application schema is PostgreSQL-specific (Alembic migrations, partial
indexes, check constraints), so the HTTP-level tests run against a real
database. A dedicated disposable test database is created, migrated to head
with Alembic, used by the whole session, and dropped afterwards — the
development database is never touched.

Override the target with ``TEST_DATABASE_URL`` (default:
``postgresql+psycopg2://halgheh:halgheh@localhost:5433/halgheh_test``, see
service/README.md). ``DATABASE_URL`` is pointed at the test database before
any service module is imported, because ``service/core/database.py`` reads
the environment at import time.
"""

from __future__ import annotations

import os
import uuid
from dataclasses import dataclass
from pathlib import Path

import pytest
from sqlalchemy.engine import make_url

REPO_ROOT = Path(__file__).resolve().parents[2]

TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+psycopg2://halgheh:halgheh@localhost:5433/halgheh_test",
)
# Must happen before service.* imports (engine is created at import time).
os.environ["DATABASE_URL"] = TEST_DATABASE_URL


@dataclass
class TestUser:
    """An authenticated user: bearer header plus the registered account."""

    id: int
    username: str
    headers: dict


def _connect_admin():
    import psycopg2

    url = make_url(TEST_DATABASE_URL)
    connection = psycopg2.connect(
        dbname="postgres",
        user=url.username,
        password=url.password,
        host=url.host,
        port=url.port,
    )
    connection.autocommit = True
    return connection


def make_dbname() -> str:
    return make_url(TEST_DATABASE_URL).database


def _drop_test_database() -> None:
    connection = _connect_admin()
    try:
        with connection.cursor() as cur:
            cur.execute(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                "WHERE datname = %s AND pid <> pg_backend_pid()",
                (make_dbname(),),
            )
            cur.execute(f'DROP DATABASE IF EXISTS "{make_dbname()}"')
    finally:
        connection.close()


@pytest.fixture(scope="session")
def client():
    """FastAPI TestClient bound to a fresh, fully migrated test database."""
    from alembic import command
    from alembic.config import Config
    from fastapi.testclient import TestClient

    _drop_test_database()

    connection = _connect_admin()
    try:
        with connection.cursor() as cur:
            cur.execute(f'CREATE DATABASE "{make_dbname()}"')
    finally:
        connection.close()

    config = Config(str(REPO_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(REPO_ROOT / "alembic"))
    command.upgrade(config, "heads")

    import service.main

    with TestClient(service.main.app) as test_client:
        yield test_client

    from service.core.database import engine

    engine.dispose()
    _drop_test_database()


def _register(client, username: str, password: str) -> TestUser:
    registered = client.post(
        "/auth/register",
        json={"username": username, "password": password, "name": username},
    )
    assert registered.status_code == 201, registered.text
    login = client.post(
        "/auth/login", json={"username": username, "password": password}
    )
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    return TestUser(
        id=registered.json()["id"],
        username=username,
        headers={"Authorization": f"Bearer {token}"},
    )


@pytest.fixture(scope="session")
def make_user(client):
    """Factory for additional users with unique usernames."""

    def _make() -> TestUser:
        return _register(
            client, f"user_{uuid.uuid4().hex[:12]}", "test-password-123"
        )

    return _make


@pytest.fixture(scope="session")
def owner(client) -> TestUser:
    """A document owner reused across tests (users are never deleted)."""
    return _register(client, "doc_owner", "test-password-123")


@pytest.fixture(scope="session")
def stranger(client) -> TestUser:
    """An unrelated user: must never see the owner's private content."""
    return _register(client, "doc_stranger", "test-password-123")
