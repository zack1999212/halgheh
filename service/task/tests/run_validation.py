"""Dependency-free runner for the task module's test suites.

Purpose: the container image deliberately does not ship pytest/httpx (they
are not runtime dependencies and adding them requires approval). This
runner executes the pytest-style suites in this directory WITHOUT pytest by:

* installing a minimal ``pytest`` stub in ``sys.modules`` (provides
  ``raises`` with the ``err.value`` API, ``fixture``, ``importorskip``),
* emulating the ``db``/``make_user`` fixtures from ``conftest.py``
  (fresh in-memory SQLite per test, foreign keys enforced),
* importing each test module and invoking every ``test_*`` function.

When real pytest IS installed, prefer the standard invocation:

    python -m pytest service/task/tests -v

Run inside the backend container:

    docker exec halgheh-dev-backend-1 python service/task/tests/run_validation.py

Exit code 0 = all executed tests passed; 1 = failures; skipped modules
(missing optional dependencies, e.g. httpx for the API suite) do not fail
the run but are reported.
"""

from __future__ import annotations

import contextlib
import importlib
import inspect
import sys
import traceback
import types
from pathlib import Path

# Make the repository root importable regardless of how the script is invoked.
ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

TEST_MODULES = [
    "test_tasks",
    "test_assignments",
    "test_hierarchy",
    "test_status",
    "test_filters",
    "test_labels_comments_activity",
    "test_api",
]


# ---------------------------------------------------------------------------
# pytest stub (installed only when the real pytest is unavailable)
# ---------------------------------------------------------------------------


def _install_pytest_stub() -> None:
    if "pytest" in sys.modules:
        return
    try:
        importlib.import_module("pytest")
        return  # real pytest present; nothing to stub
    except ModuleNotFoundError:
        pass

    fake = types.ModuleType("pytest")

    class _RaisesContext:
        def __init__(self, expected):
            self._expected = expected
            self.value = types.SimpleNamespace(value=None)

        def __enter__(self):
            return self.value

        def __exit__(self, exc_type, exc_val, exc_tb):
            if exc_type is None:
                raise AssertionError(
                    f"DID NOT RAISE {getattr(self._expected, '__name__', self._expected)}"
                )
            expected = self._expected
            expected_tuple = expected if isinstance(expected, tuple) else (expected,)
            if not isinstance(exc_val, expected_tuple):
                return False  # re-raise the unexpected exception
            self.value.value = exc_val
            return True

    def raises(expected):
        return _RaisesContext(expected)

    def fixture(*args, **kwargs):
        if args and callable(args[0]):
            return args[0]
        return lambda fn: fn

    def importorskip(name, *args, **kwargs):
        raise ImportError(f"missing optional dependency: {name}")

    fake.raises = raises
    fake.fixture = fixture
    fake.importorskip = importorskip
    fake.mark = types.SimpleNamespace()
    sys.modules["pytest"] = fake


# ---------------------------------------------------------------------------
# Fixture emulation (mirrors conftest.py)
# ---------------------------------------------------------------------------


def _make_db():
    from sqlalchemy import event
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool
    from sqlalchemy.schema import CreateTable, CreateIndex

    from service.core.database import Base
    import service.auth.models  # noqa: F401  (registers users)
    import service.task.models  # noqa: F401  (registers the task domain)
    # ``User`` declares relationships to other modules' models; SQLAlchemy
    # needs those classes registered before the first instance is created.
    # Importing them here does NOT modify those modules.
    import service.calendar.models.calendar  # noqa: F401
    import service.ai.models.credential  # noqa: F401
    import service.agent.models.message  # noqa: F401
    import service.notifications.models.notification  # noqa: F401
    import service.notifications.models.notification_preference  # noqa: F401

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

    # The models carry two PostgreSQL-only CHECK expressions (``char_length``
    # and the ``~`` regex operator on label colors). They are correct for the
    # production target (validated against real Postgres by
    # ``validate_postgres.py``); for the SQLite unit DB we translate the DDL:
    #   char_length(x)  -> length(x)
    #   color ~ regex   -> LIKE/length approximation (regex isn't supported)
    ddl_lines = []
    for table in Base.metadata.sorted_tables:
        ddl = str(CreateTable(table).compile(engine))
        ddl = ddl.replace("char_length(", "length(")
        ddl = ddl.replace(
            "color ~ '^#[0-9A-Fa-f]{6}$'",
            "color LIKE '#%' AND length(color) = 7",
        )
        ddl_lines.append(ddl)
        for index in table.indexes:  # unique + lookup indexes (FKs too)
            ddl_lines.append(str(CreateIndex(index).compile(engine)))
    with engine.connect() as conn:
        for ddl in ddl_lines:
            conn.exec_driver_sql(ddl)
        conn.commit()

    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    return factory()


def _run_test(fn, db):
    from service.auth.models import User

    def make_user(username: str) -> User:
        user = User(username=username, name=username.title(), hashed_password="test-hash")
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    kwargs = {}
    for name in inspect.signature(fn).parameters:
        if name == "db":
            kwargs[name] = db
        elif name == "make_user":
            kwargs[name] = make_user
        else:
            raise RuntimeError(f"Unknown fixture parameter: {name!r} in {fn.__name__}")
    fn(**kwargs)


# ---------------------------------------------------------------------------
# Execution
# ---------------------------------------------------------------------------


def main() -> int:
    _install_pytest_stub()

    passed, failed, skipped = 0, 0, 0
    failures = []
    print("=" * 72)
    print("TASK MODULE — unit test suites (SQLite in-memory, FK enforced)")
    print("=" * 72)

    for module_name in TEST_MODULES:
        dotted = f"service.task.tests.{module_name}"
        print(f"\n--- {dotted} ---")
        try:
            module = importlib.import_module(dotted)
        except ImportError as exc:
            print(f"  SKIPPED: {exc}")
            skipped += 1
            continue
        except Exception:
            print("  MODULE IMPORT FAILED:")
            traceback.print_exc()
            failed += 1
            failures.append((dotted, "<module import>", "import error"))
            continue

        test_fns = [
            (name, obj)
            for name, obj in vars(module).items()
            if name.startswith("test_") and inspect.isfunction(obj)
        ]
        for name, fn in test_fns:
            db = _make_db()
            try:
                _run_test(fn, db)
                passed += 1
                print(f"  PASS {name}")
            except Exception:
                failed += 1
                print(f"  FAIL {name}")
                failures.append((dotted, name, traceback.format_exc()))
            finally:
                db.close()

    print("\n" + "=" * 72)
    print(f"RESULT: passed={passed} failed={failed} skipped_modules={skipped}")
    print("=" * 72)
    if failures:
        print("\nFailure details:")
        for dotted, name, tb in failures:
            print(f"\n### {dotted}::{name}\n{tb}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
