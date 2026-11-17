"""Shared fixtures for the task module's unit tests.

Runs against an in-memory SQLite database with foreign keys enforced
(``PRAGMA foreign_keys=ON``), so cascade deletes and ``ON DELETE SET NULL``
behavior — including activity-history preservation — are exercised for real.
No PostgreSQL server or extra packages are required beyond pytest and the
service's own dependencies.

Run inside the backend container:

    docker compose run --rm backend python -m pytest service/task/tests -v
"""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from service.core.database import Base
import service.auth.models  # noqa: F401  (registers the users table)
import service.task.models  # noqa: F401  (registers the task-domain tables)


@pytest.fixture()
def db():
    """A fresh in-memory database per test, wrapped in one shared
    connection (StaticPool) so all sessions see the same data."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _enable_sqlite_fk(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = factory()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture()
def make_user(db):
    """Factory fixture: create users with unique usernames."""

    def _make(username: str):
        from service.auth.models import User

        user = User(username=username, name=username.title(), hashed_password="test-hash")
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    return _make
