# Task Management Module

Collaborative task management for the halgheh backend: tasks, hierarchical
subtasks, assignments (delegation with history), status transitions with an
enforced `completed_at` invariant, comments, user-owned labels, and a
complete per-task audit trail.

This README documents the **implemented** backend. Design documents live
alongside it (`TASK_ARCHITECTURE.md`, `TASK_DATABASE_DESIGN.md`,
`TASK_API_DESIGN.md` v2, `TASK_FRONTEND_DESIGN.md`,
`TASK_INTEGRATION_CONTRACT.md`).

---

## 1. Architecture

Four layers inside `service/task/`, following the platform's
repository/service pattern:

```
router.py          HTTP layer (26 routes, prefix /api/tasks)
  │  resolves get_db + get_current_user; maps results to Pydantic responses
  ▼
service.py         Business rules and authorization decisions
  │  ownership checks, status machine, hierarchy/cycle rules,
  │  audit-trail writes, transaction boundaries (_commit)
  ▼
repository.py      All database queries (single source of SQL truth)
  │  visible-scope clauses, filters/sort/pagination, aggregations,
  │  eager loading (selectinload), flush/commit discipline
  ▼
models/            SQLAlchemy models (6 tables) + alembic migration 017
```

Supporting modules:

- `schemas.py` — request/response models. Write schemas use
  `extra="forbid"` (mass-assignment protection); list envelopes are
  `{items, total, limit, offset}`.
- `permissions.py` — role predicates: `task_role()` → `owner` / `assignee` /
  `none`, plus the `can_assign()` integration point for a future
  team/manager model.
- `tests/` — unit suites (SQLite), API suite (TestClient), and two
  dependency-free runners (see §9).

Key invariants enforced across layers:

- **404 for invisible or nonexistent**, `403` for visible-but-insufficient.
  Invisible ids are indistinguishable from nonexistent ones (IDOR-safe).
- **The actor is never taken from the request body** — always
  `current_user.id` from the existing auth dependency.
- **Status is not PATCHable** — only `PUT …/status` manages status together
  with `completed_at` so the DB CHECK (`ck_tasks_completed_state`) can never
  be violated through the API.
- **Every important change is audited** in `task_activities` inside the same
  transaction as the change itself.

## 2. Database models (migration `017_task_domain_foundation`)

| Table | Purpose | Notable constraints |
|---|---|---|
| `tasks` | Tasks and subtasks (`parent_task_id` self-FK) | status/priority CHECKs, `ck_tasks_completed_state` (done ⇔ completed_at set), `ck_tasks_date_order`, `ck_tasks_parent_not_self` |
| `task_assignments` | Delegation with history (`active`/`cancelled`) | unique pair `(task_id, assigned_user_id)` — one row per pair ever |
| `task_comments` | Task comments | FKs CASCADE on task/user delete |
| `task_activities` | Immutable audit trail | FKs `ON DELETE SET NULL` — history survives task/user deletion |
| `task_labels` | User-owned tags | unique `(created_by, name)`; color CHECK `^#[0-9A-Fa-f]{6}$` |
| `task_label_assignments` | Task↔label links | unique `(task_id, label_id)`; CASCADE both sides |

Delete semantics:

- **Task deleted (hard delete, platform convention):** subtasks are promoted
  to top level (SET NULL); comments/assignments/label links cascade; a final
  `task_deleted` activity entry with a JSON snapshot is written *before*
  deletion; all other activity rows survive with `task_id = NULL`.
- **User deleted:** their tasks and labels cascade; audit rows survive with
  `actor_id = NULL`.

Performance indexes cover every list path: creator+status, due_date,
parent_task_id, assignment lookups (both directions), label links,
activity `(task_id, created_at, id)`.

## 3. API endpoint reference

Prefix `/api/tasks` — **convention note:** other platform modules use bare
prefixes (`/auth`, `/calendars`); this module follows the approved task
specification instead. The prefix is router-internal, so alignment later is
a one-word change in `router.py`. The router is already registered in
`service/main.py` (import + `include_router`) — no shared-file edits were
made.

### Tasks

| Method | Path | Purpose | Success |
|---|---|---|---|
| `POST` | `/api/tasks` | Create (starts `todo`) | `201` |
| `GET` | `/api/tasks` | List; `scope=visible\|created\|assigned\|assigned_by` | `200` |
| `GET` | `/api/tasks/my` | Tasks actively assigned to the caller | `200` |
| `GET` | `/api/tasks/assigned-by-me` | Tasks the caller actively delegated | `200` |
| `GET` | `/api/tasks/statistics` | Aggregated counters (SQL-side) | `200` |
| `GET` | `/api/tasks/{task_id}` | Detail (labels + assignments embedded) | `200` |
| `PATCH` | `/api/tasks/{task_id}` | title/description/priority/dates (owner) | `200` |
| `DELETE` | `/api/tasks/{task_id}` | Hard delete (owner) | `204` |
| `PUT` | `/api/tasks/{task_id}/status` | Validated transition | `200` |
| `PUT` | `/api/tasks/{task_id}/parent` | Attach/move/detach parent (owner) | `200` |
| `GET` | `/api/tasks/{task_id}/parent` | Parent if visible | `200/null` |
| `POST` | `/api/tasks/{task_id}/subtasks` | Create subtask (owner; body `parent_task_id` must equal URL id) | `201` |
| `GET` | `/api/tasks/{task_id}/subtasks` | List subtasks | `200` |

### Assignments / comments / activity / labels

| Method | Path | Purpose | Success |
|---|---|---|---|
| `POST` | `/api/tasks/{task_id}/assignments` | Assign (owner; idempotent; cancelled rows reactivate) | `200` |
| `PUT` | `/api/tasks/{task_id}/assignee` | Replace all active assignees (owner) | `200` |
| `DELETE` | `/api/tasks/{task_id}/assignments/{user_id}` | Cancel assignment (owner; row kept) | `204` |
| `GET` | `/api/tasks/{task_id}/comments` | List (oldest first) | `200` |
| `POST` | `/api/tasks/{task_id}/comments` | Add (owner or active assignee) | `201` |
| `DELETE` | `/api/tasks/{task_id}/comments/{comment_id}` | Delete (author only) | `204` |
| `GET` | `/api/tasks/{task_id}/activities` | Audit trail (newest first) | `200` |
| `POST` | `/api/tasks/labels` | Create caller's label | `201` |
| `GET` | `/api/tasks/labels` | List caller's labels | `200` |
| `PATCH` | `/api/tasks/labels/{label_id}` | Rename/recolor (owner) | `200` |
| `DELETE` | `/api/tasks/labels/{label_id}` | Delete label | `204` |
| `PUT` | `/api/tasks/{task_id}/labels/{label_id}` | Attach (owner; idempotent) | `200` |
| `DELETE` | `/api/tasks/{task_id}/labels/{label_id}` | Detach (owner; idempotent) | `204` |

Shared list parameters: `status[]`, `priority[]` (repeatable),
`created_by`, `assigned_user_id`, `parent_task_id`, `label_id`, `due`
(`overdue|today|upcoming|no_due`), `q` (search), `sort`
(`due_date|created_at|updated_at|priority`), `order` (`asc|desc`),
`limit` (1–100, default 20), `offset` (≥ 0). Invalid values → `422`.

Error style: `{"detail": "<sentence>"}` everywhere — `401` unauthenticated,
`404` invisible/nonexistent, `403` visible-but-forbidden, `400` business
rule, `409` uniqueness race, `422` payload validation, `500` global handler.

## 4. Authentication

Bearer JWT via the existing `service/auth` dependency (`get_current_user`).
No new auth code. Missing/invalid token → `401 {"detail": "Not
authenticated"}`. Example header:

```
Authorization: Bearer <token from POST /auth/login>
```

## 5. Authorization

Object-level, enforced in `service.py` via `permissions.task_role`:

| Operation | none / invisible | assignee (active) | owner |
|---|---|---|---|
| View / list / subtasks / parent / comments / activities | `404` | `200` | `200` |
| PATCH fields, parent, subtasks, labels, DELETE task | `404` | `403` | `200/204` |
| PUT status | `404` | `200` | `200` |
| POST comment | `404` | `201` | `201` |
| DELETE comment | `404/403` | author → `204`, else `403` | author → `204` |
| Assignment create/replace/cancel | `404` | `403` | `200/204` |

- Team/manager supervision does **not** exist yet; "manager" is currently
  represented by the `assigned-by-me` view. The delegation right is
  centralized in `permissions.can_assign` as the documented integration
  point.
- Cross-user isolation is total: lists, statistics, `/my`, `/assigned-by-me`
  only ever see the caller's data; foreign and guessed ids both return
  `404`.

## 6. Business rules

- **Creation:** status starts `todo`; `due_date >= start_date`; title and
  comment content are stripped and non-empty; priorities are
  `low|medium|high|urgent`.
- **Status machine** (`ALLOWED_STATUS_TRANSITIONS` in `service.py`):
  `todo → in_progress|blocked|done|cancelled`,
  `in_progress → todo|blocked|done|cancelled`,
  `blocked → in_progress|done|cancelled`, `done → todo|in_progress`,
  `cancelled → todo`. Same-status is an idempotent no-op. `done` ⇔
  `completed_at` is set, enforced by the transition code *and* a DB CHECK.
- **Hierarchy:** subtask creation is owner-only, so descendants inherit the
  creator's visibility; cycles are impossible (walk-up check rejects direct,
  deep, and self cycles with `400`; DB CHECK rejects self-parents).
- **Assignments:** idempotent (one row per pair, ever); cancelling keeps the
  row as history; re-assigning reactivates in place; a uniqueness race
  between two concurrent assignments is mapped to `409`, never a raw 500.
- **Audit trail:** `task_created`, `task_updated` (title/description),
  `priority_changed`, `due_date_changed`, `status_changed`,
  `assignee_added`, `assignee_removed`, `comment_added`, `label_added`,
  `label_removed`, `task_deleted` (with JSON snapshot) — same transaction
  as the change.
- **Transactions:** service functions own commit boundaries
  (`_commit`); `IntegrityError` → rollback → mapped HTTP error; no internals
  leak.

## 7. Migration instructions

Migration `alembic/versions/017_task_domain_foundation.py` (revision
`017`, down-revision `016` — renumbered after merging with `origin/dev`,
whose own chain occupies revisions 012–016). Apply inside the backend
container:

```bash
docker exec halgheh-dev-backend-1 alembic upgrade head      # → 017
docker exec halgheh-dev-backend-1 alembic downgrade 016     # removes all 6 tables cleanly
```

Verified against an isolated PostgreSQL (not the dev database): full chain
up, `017 → 016` down (0 task tables left), and re-up — plus the full
`validate_postgres.py` schema/lifecycle/concurrency suite.

`alembic/env.py` imports the task models (required so autogenerate sees
the task tables instead of trying to drop them):

```python
import service.task.models  # noqa: F401,E402
```

## 8. Example API requests

All examples assume `Authorization: Bearer <token>`.

```bash
# Create a task
curl -X POST http://localhost:8000/api/tasks \
  -H 'Content-Type: application/json' \
  -d '{"title": "Write API docs", "priority": "high", "due_date": "2026-11-30"}'
# → 201 {"id": 12, "status": "todo", "priority": "high", "labels": [], "assignments": [], ...}

# List with filters + pagination
curl 'http://localhost:8000/api/tasks?status=todo&priority=high&sort=due_date&limit=2&offset=0'
# → 200 {"items": [ ... ], "total": 1, "limit": 2, "offset": 0}

# Invalid transition
curl -X PUT http://localhost:8000/api/tasks/12/status -d '{"status": "blocked"}'
# → 400 {"detail": "Invalid status transition from 'done' to 'blocked'"}

# Assign (idempotent)
curl -X POST http://localhost://8000/api/tasks/12/assignments -d '{"assigned_user_id": 7}'
# → 200 (task with "assignments": [{... "assignment_status": "active"}])

# Statistics
curl http://localhost:8000/api/tasks/statistics
# → 200 {"total": 5, "open": 3, "completed": 2, "overdue": 1, "due_today": 1,
#        "completion_rate": 0.4, "by_status": {...}, "by_priority": {...}}
```

## 9. Tests

`service/task/tests/`:

| File | Covers |
|---|---|
| `conftest.py` | shared fixtures (in-memory SQLite, FKs enforced) |
| `test_tasks.py` | CRUD, per-field audit, authorization, delete semantics |
| `test_assignments.py` | assignment lifecycle, views, history |
| `test_hierarchy.py` | subtasks, direct/deep/self cycle rejection |
| `test_status.py` | transition machine, `completed_at` invariant |
| `test_filters.py` | filters, search, pagination, ordering |
| `test_labels_comments_activity.py` | labels, comments, audit preservation |
| `test_api.py` | 15 TestClient suites incl. auth, IDOR, isolation (needs httpx) |
| `run_validation.py` | **dependency-free runner** for all SQLite suites |
| `validate_postgres.py` | **real-Postgres validator** (schema + lifecycle + concurrency) |

Run (backend container has no pytest/httpx; they are *not* installed and no
dependency file was touched):

```bash
# 61 unit tests, zero extra dependencies:
docker exec halgheh-dev-backend-1 python service/task/tests/run_validation.py

# API suite when pytest + httpx are approved as dev dependencies:
docker exec halgheh-dev-backend-1 python -m pytest service/task/tests -v

# Real-Postgres validation (isolated DB only; refuses otherwise):
docker run -d --rm --name task-test-db --network halgheh-dev_default \
  -e POSTGRES_USER=halgheh -e POSTGRES_PASSWORD=halgheh \
  -e POSTGRES_DB=halgheh_test postgres:17-alpine
docker exec -e DATABASE_URL=postgresql+psycopg2://halgheh:halgheh@task-test-db:5432/halgheh_test \
  -e TASK_VALIDATE_ALLOW_REAL_DB=1 \
  halgheh-dev-backend-1 alembic upgrade head
docker exec -e DATABASE_URL=postgresql+psycopg2://halgheh:halgheh@task-test-db:5432/halgheh_test \
  -e TASK_VALIDATE_ALLOW_REAL_DB=1 \
  halgheh-dev-backend-1 python service/task/tests/validate_postgres.py
docker stop task-test-db
```

`validate_postgres.py` safety gate: requires an explicit `DATABASE_URL`
whose database name contains `test`/`validate` **and** the explicit opt-in
`TASK_VALIDATE_ALLOW_REAL_DB=1`, so it can never run against the shared
database by accident.

## 10. Known limitations

1. **No teams/managers yet** — ownership is per-user; delegation is
   owner-only. `permissions.can_assign` is the integration point.
2. **`403` for visible-but-insufficient actions** — a deliberate delta from
   the Phase 1 "never 403" note; invisible resources still 404.
3. **`/api/tasks` prefix** — differs from other modules' bare prefixes (per
   the approved spec); flagged for future alignment.
4. **pytest/httpx are not installed** — the API suite is skipped by the
   dependency-free runner; approving them as dev dependencies would enable
   `python -m pytest`.
5. ~~`alembic/env.py` one-line import pending approval~~ — **resolved**:
   `import service.task.models` is now in `alembic/env.py` (line 25).
6. **Search uses `ILIKE`** — `%`/`_` in user input are wildcard characters
   (standard SQL LIKE behavior, no injection risk; parameters are bound).
7. **No notifications/events** — task changes are audited in
   `task_activities` only; wiring the notifications module is future work.
8. **Statistics `due_today` uses the server's local date** — fine for a
   single-timezone deployment; revisit for multi-timezone users.
9. **Hard delete only** — no soft delete, per platform convention.
