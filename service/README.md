# Backend (service/)

Single FastAPI app split into parts, each in its own folder:

- `docs/` – documents part
- `calendar/` – calendar part
- `task/` – tasks part
- `share/` – sharing part

`main.py` is the single entrypoint that mounts every part's router.

## Structure (per part)

```
<part>/
├── router.py      # API routes for this part
├── models/        # Pydantic schemas / DB models
```

Shared code goes in `core/`, tests in `tests/`.

## Database migrations (Alembic)

Database schema changes are owned exclusively by Alembic. The application never
calls `create_all()` and never runs migrations during FastAPI startup. Run
migrations before starting the application.

- Configuration: `alembic.ini` (repository root, one level above `service/`)
- Migration environment: `alembic/env.py`
- Migration scripts: `alembic/versions/`
- Database URL: read from `DATABASE_URL` (see `service/core/database.py`);
  credentials are never stored in `alembic.ini`
- Tracking table: `alembic_version` (managed by Alembic)

All backend modules share one migration history. Each migration is a Python
file with `upgrade()` / `downgrade()` functions; revision IDs and
`down_revision` links form the history. Alembic autogeneration is enabled
(`compare_type` and `compare_server_default` are on).

### Initial setup

Run all Alembic commands from the repository root (where `alembic.ini` lives),
with the backend virtual environment activated.

Fresh database:

```bash
alembic upgrade head
```

Existing database that predates Alembic (baseline):

```bash
# 1. Verify the live schema matches alembic/versions/001_initial_schema.py.
# 2. Mark that schema as the baseline without re-running it:
alembic stamp 001
# 3. Apply any later migrations:
alembic upgrade head
```

The development database for this repository has already been stamped at `001`
and upgraded to head, so it is ready to use.

### Generate a migration

```bash
alembic revision --autogenerate -m "describe schema change"
```

Always inspect the generated file before committing. Autogeneration does not
reliably detect column renames, data transformations, or every constraint and
index change. Add manual `op.execute(...)` / data operations where needed.

### Apply, inspect, and roll back

```bash
alembic upgrade head      # apply all pending migrations
alembic current           # show the current revision
alembic history           # show the migration history
alembic check             # fail if models differ from the migrated schema
alembic downgrade -1      # roll back one revision (review first: data loss)
```

`downgrade` operations must be reviewed before use because they can cause data
loss.

### Team workflow for concurrent migrations

1. All developers use the same shared `alembic/versions/` directory and history.
2. Each migration has a unique revision ID.
3. Every migration references its parent through `down_revision`.
4. Pull the latest migration files before creating a new migration.
5. Independent migrations created from the same parent revision produce
   multiple heads.
6. Resolve multiple heads with `alembic merge -m "merge heads" <rev1> <rev2>`
   (or `alembic merge heads`) when appropriate.
7. A migration that depends on another migration must establish the correct
   `down_revision`.
8. Never edit migrations that have already been applied to a shared
   environment.
9. Commit SQLAlchemy model changes and their corresponding migration files
   together.
10. Review migration files during pull requests.

## Setup

```bash
cd service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run

From the repository root:

```bash
alembic upgrade head
uvicorn service.main:app --reload --port 8000
```

Interactive API docs: http://localhost:8000/docs

## Tests

The database tests need a real PostgreSQL instance (Alembic migrations and the
application schema are PostgreSQL-specific). They create and drop a dedicated
test database, so the development database is never touched. Set
`TEST_DATABASE_URL` if the default
(`postgresql+psycopg2://halgheh:halgheh@localhost:5433/halgheh_test`) does not
match your environment. From the repository root:

```bash
service/.venv/bin/python -m pytest
```

`EXISTING_DATABASE_URL` can be set to compare a freshly migrated database with
an existing one; the test is skipped when that database is unavailable.

## Docker

From the project root:

```bash
docker compose up -d db
DATABASE_URL=postgresql+psycopg2://halgheh:halgheh@localhost:5433/halgheh alembic upgrade head
docker compose up
```

The backend container does not run migrations; apply them before starting the
application. The command above targets the database port published by Docker.
