# Tasks Frontend Integration

This document describes how the Tasks frontend is currently integrated, the API/auth conventions to follow, and the backend task contract relevant to implementation. It also lists integration changes that would require approval (none are made here).

## 1. Current frontend integration (real)

### 1.1 Routing and module mounting
- `web/app/src/App.jsx` mounts Tasks inside the protected app shell:
  - `ProtectedRoute` -> `AppLayout` (`web/app/workspace/AppLayout.jsx`)
  - Route: `path="tasks"` -> `TasksLayout` (`web/app/workspace/layouts/TasksLayout.jsx`) -> index element `TasksPage` (`web/app/task/TasksPage.jsx`)
- `TasksLayout` is a minimal module boundary (`<div class="module-layout module-layout--tasks min-w-0"><Outlet /></div>`) prepared for future module-specific navigation without changing the global shell.
- `AppLayout` provides global header/chrome, current-user bootstrap (`getCurrentUser`), tooltip provider, and main outlet; it handles unauthorized by clearing session and redirecting to `/login`.
- No task-specific navigation/routing changes are required for implementing the Tasks UI within the existing route.

### 1.2 Authentication/session handling conventions
- Shared API helper: `web/app/src/api.js`
  - Token storage key: `localStorage.token` (`getToken/setToken/clearToken`)
  - Base URL: `import.meta.env.VITE_API_URL || 'http://localhost:8001'`
  - `apiRequest(path, options)` attaches `Authorization: Bearer <token>` when available, sends JSON bodies, parses responses, normalizes FastAPI `detail` errors, throws `ApiError(message, status)`
  - Network failures throw `ApiError` with status `0`
- Feature pattern (from Calendar): pass `onUnauthorized` from page to hooks/components; on `401` clear token (`clearToken()` from `src/api.js` or session clear flow as appropriate in context) and navigate to `/login` with `replace: true`.
- Auth module also exposes `clearSession` in `auth/api.js` (used by `AppLayout`); Calendar page uses `clearToken()` from `src/api.js` directly. Tasks implementation should follow the existing module-local pattern consistently (prefer the same approach as Calendar for feature-level unauthorized handling unless a shared convention is already mandated).

### 1.3 Existing task frontend code
- `web/app/task/TasksPage.jsx`: placeholder only.
- `web/app/features/tasks/api/client.js`: `listTasks()` -> `GET /api/tasks` via `apiRequest` with fallback message; expects `{ items, total, limit, offset }`.
- No other task UI/hooks/components currently exist in `web/app/task/`.

## 2. Backend Task API integration contract (existing)

### 2.1 Base path and auth
- **Base path:** `/api/tasks` (router prefix in `service/task/router.py`; included in `service/main.py`)
- **Auth:** Bearer JWT (`Authorization: Bearer <token>`) via existing auth dependency; unauthenticated -> `401 {"detail":"Not authenticated"}` (or equivalent).
- **Error shape:** FastAPI-style `{"detail": ...}` (string or validation details); frontend should surface normalized messages via `apiRequest`/`ApiError`.

### 2.2 List/query contract
- List envelope: `{ "items": [...], "total": <int>, "limit": <int>, "offset": <int> }`
- Default pagination: `limit=20` (max 100), `offset=0`
- Task list endpoints:
  - `GET /api/tasks?scope=visible|created|assigned|assigned_by&...`
  - `GET /api/tasks/my` (assigned to caller)
  - `GET /api/tasks/assigned-by-me`
  - `GET /api/tasks/{task_id}/subtasks`
- Supported filters/query params (validated server-side): repeatable `status`, repeatable `priority`, `created_by`, `assigned_user_id`, `parent_task_id`, `label_id`, `due` (`overdue|today|upcoming|no_due`), `q` (search title/description), `sort` (`due_date|created_at|updated_at|priority`), `order` (`asc|desc`), `limit`, `offset`.
- `TaskSummary` (list item): `id, title, status, priority, start_date, due_date, completed_at, parent_task_id, created_by, created_at, updated_at`.

### 2.3 Core task operations
- `POST /api/tasks` (201): create task (`title`, optional `description`, `priority` default medium, `start_date`, `due_date`) -> `TaskResponse`; status starts as `todo`.
- `GET /api/tasks/{task_id}` (200): `TaskResponse` (summary fields + `description`, `labels[]`, `assignments[]`).
- `PATCH /api/tasks/{task_id}` (200, owner): update `title/description/priority/start_date/due_date` only (status excluded).
- `DELETE /api/tasks/{task_id}` (204, owner): hard delete.
- `PUT /api/tasks/{task_id}/status` (200): body `{ "status": ... }`, validated transitions; `done` manages `completed_at`.
- `PUT /api/tasks/{task_id}/parent` (200, owner): attach/move/detach parent (`{ "parent_task_id": <id|null> }`), cycle-safe.
- `GET /api/tasks/{task_id}/parent` (200): returns parent task or `null`.

### 2.4 Subtasks, assignments, comments, activity, labels
- Subtasks:
  - `POST /api/tasks/{task_id}/subtasks` (201, owner): body includes subtask fields and `parent_task_id` which must match URL task id.
  - `GET /api/tasks/{task_id}/subtasks` (200): paginated task list envelope.
- Assignments (owner-only mutations; idempotent/reactivation semantics per backend):
  - `POST /api/tasks/{task_id}/assignments` body `{ "assigned_user_id": <int> }` (200, returns updated task)
  - `PUT /api/tasks/{task_id}/assignee` (replace active assignees; see backend implementation for exact payload shape during implementation)
  - `DELETE /api/tasks/{task_id}/assignments/{user_id}` (204)
- Comments:
  - `GET /api/tasks/{task_id}/comments` (200): `{ items, total, limit, offset }`
  - `POST /api/tasks/{task_id}/comments` (201, owner or active assignee): `{ "content": "..." }`
  - `DELETE /api/tasks/{task_id}/comments/{comment_id}` (204, author only)
- Activity:
  - `GET /api/tasks/{task_id}/activities` (200): `{ items, total, limit, offset }` (audit trail)
- Labels:
  - `POST /api/tasks/labels` (201): `{ "name": "...", "color": "#RRGGBB"|null }`
  - `GET /api/tasks/labels` (200): paginated labels
  - `PATCH /api/tasks/labels/{label_id}` (200), `DELETE /api/tasks/labels/{label_id}` (204)
  - `PUT /api/tasks/{task_id}/labels/{label_id}` (200, attach/idempotent), `DELETE /api/tasks/{task_id}/labels/{label_id}` (204, detach)

### 2.5 Authorization and visibility rules (frontend implications)
- Invisible/nonexistent resources return `404` (do not distinguish); visible-but-forbidden returns `403`.
- Owner can edit/delete/manage hierarchy/assignments/labels; owner or active assignee can change status and add comments (subject to backend rules); comment deletion restricted to author.
- Frontend must handle `401/403/404/409/422` gracefully with existing state components/messages and avoid assuming hidden resources exist.

## 3. Proposed Tasks frontend integration approach (implementation, inside `web/app/task/`)

- **API module:** create `web/app/task/api.js` with thin wrappers over `apiRequest` for all task endpoints actually used (include `fallbackMessage` per call, support `signal` for list/detail fetches where useful).
- **Hooks:** feature-local hooks (`useTasks`, `useTaskDetails`) to manage query params, abort/race safety, loading/error states, and mutations/reloads (Calendar hook patterns).
- **UI composition:** `TasksPage` orchestrates state and passes `onUnauthorized` to hooks; uses shared shells/components (`DialogShell`, `ConfirmDialog`, `Sheet`, `FormField`, state components) and shadcn primitives.
- **Data refresh:** after mutations, reload affected list/detail collections to reflect server truth (status, completed_at, assignments, counts, ordering).
- **No shared/global changes:** keep routing, layouts, shared components/styles, and package config untouched.

## 4. Integration changes requiring approval

None identified for the planned Tasks frontend implementation **if work remains strictly within `web/app/task/`**.

Potential cases that would require approval before proceeding:
- Any change outside `web/app/task/` (e.g. `src/App.jsx`/routes, `workspace/*` layouts/navigation, `src/api.js`, shared UI components, global styles, Tailwind config, package manifests).
- Adding or modifying dependencies (npm packages, shadcn component generation into shared dirs).
- Introducing cross-module reuse that requires moving code into shared directories.
- Backend/API contract changes or assumptions not supported by the current `service/task` implementation (e.g. missing fields/endpoints/query semantics needed by UI).

Implementation should stop and request approval if any of the above becomes necessary.
