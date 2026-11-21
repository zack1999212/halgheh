# Tasks Frontend Architecture

This document describes the **existing** frontend architecture relevant to the Tasks module, based on inspection of the current codebase (Calendar reference, app shell, shared UI, and backend task API). It also defines a proposed Tasks frontend structure that follows the established Calendar patterns.

## 1. Current application/frontend architecture (real)

### 1.1 App shell and routing
- Entry: `web/app/src/main.jsx` mounts React app with `BrowserRouter` and imports `src/index.css`.
- Router: `web/app/src/App.jsx`
  - Public: `/login`, `/register`
  - Protected (wrapped by `auth/ProtectedRoute` + `workspace/AppLayout`): `/home`, `/workspace`, `/calendar`, `/tasks`, `/documents` (+ `:documentId`), `/settings/ai`
  - `/dashboard` redirects to `/home`; unknown routes redirect to `/login`
- Authenticated shell: `web/app/workspace/AppLayout.jsx`
  - Fetches current user via `auth/api.js#getCurrentUser()`, stores in local state
  - Handles unauthorized by clearing session (`auth/api.js#clearSession`) and navigating to `/login`
  - Renders global header (`workspace/components/AppHeader.jsx`) and `<Outlet />` inside `<main class="app-content">`
  - Wraps tree in `TooltipProvider` from `@/components/ui/tooltip`
- Module layout boundaries (prepared for module-specific chrome without changing app shell):
  - `workspace/layouts/TasksLayout.jsx` → `<div class="module-layout module-layout--tasks min-w-0"><Outlet /></div>`
  - Tasks page is routed as `path="tasks"` → `TasksLayout` → index `TasksPage`

### 1.2 Tasks module current state
- `web/app/task/TasksPage.jsx` is a placeholder page (`<section class="page-placeholder ...">` with title/description). No task UI, hooks, or task-specific components exist in `web/app/task/`.
- Existing task API client (partial): `web/app/features/tasks/api/client.js`
  - `listTasks()` calls `apiRequest('/api/tasks', { fallbackMessage: 'Could not load tasks.' })`
  - Comment notes backend router is mounted at `/api/tasks` and returns `{ items, total, limit, offset }`

### 1.3 Shared frontend foundations
- HTTP/auth helper: `web/app/src/api.js`
  - `API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001'`
  - Token stored in `localStorage` key `token` (`getToken/setToken/clearToken`)
  - `ApiError(message, status)` for status-aware handling
  - `apiRequest(path, { method='GET', body, fallbackMessage, signal })` attaches `Authorization: Bearer <token>` when present, JSON encodes body, treats 204 as `null`, parses FastAPI `detail` (string or 422 validation array), throws `ApiError` with friendly network message on fetch failure
- Utilities: `web/app/src/lib/utils.js` exports `cn(...inputs)` = `twMerge(clsx(inputs))`
- Styling stack:
  - `src/index.css`: imports `./styles/theme.css`, Tailwind base/components/utilities, minimal base layer (`* { @apply border-border }`, `body { @apply bg-background text-foreground }`), resets, shared `.button-primary/.button-secondary` classes
  - `src/styles/theme.css`: legacy `--color-*` tokens + shadcn HSL tokens (`--background`, `--primary`, etc.), Warm Mist light theme, prepared `.dark` block (unused), sidebar geometry tokens
  - `tailwind.config.js`: content includes `./task/**/*.{js,jsx}` among feature dirs; maps CSS vars to Tailwind colors/radii; `tailwindcss-animate` plugin; `darkMode: ['class']`
  - `components.json`: shadcn `new-york`, `tsx: false`, `rsc: false`, aliases (`@/components`, `@/lib/utils`, `@/components/ui`, `@/hooks`), icon library `lucide`

### 1.4 Backend Task API (existing contract, source: `service/task/*`)
- Mounted at `/api/tasks` (`service/task/router.py`, already included in `service/main.py`); unlike other modules' bare prefixes, task prefix is router-internal.
- Auth: Bearer JWT via existing `service/auth` dependency (`get_current_user`); missing/invalid token -> `401`.
- Errors: `{"detail": "..."}` (`401/403/404/400/409/422/500` patterns). IDOR-safe: invisible/nonexistent -> `404`, visible-but-insufficient -> `403`.
- Pagination/list envelope: `{ items, total, limit, offset }` (default limit 20, max 100).
- Core resources and routes (26 routes total):
  - Tasks: `POST /api/tasks`, `GET /api/tasks` (`scope=visible|created|assigned|assigned_by`), `GET /api/tasks/my`, `GET /api/tasks/assigned-by-me`, `GET /api/tasks/statistics`, `GET /api/tasks/{id}`, `PATCH /api/tasks/{id}` (owner; no status), `DELETE /api/tasks/{id}` (owner, 204), `PUT /api/tasks/{id}/status`, `PUT /api/tasks/{id}/parent`, `GET /api/tasks/{id}/parent`
  - Subtasks: `POST /api/tasks/{id}/subtasks` (owner; body `parent_task_id` must match URL), `GET /api/tasks/{id}/subtasks`
  - Assignments: `POST /api/tasks/{id}/assignments`, `PUT /api/tasks/{id}/assignee`, `DELETE /api/tasks/{id}/assignments/{user_id}`
  - Comments: `GET/POST /api/tasks/{id}/comments`, `DELETE /api/tasks/{id}/comments/{comment_id}`
  - Activity: `GET /api/tasks/{id}/activities`
  - Labels: `POST/GET /api/tasks/labels`, `PATCH/DELETE /api/tasks/labels/{label_id}`, `PUT/DELETE /api/tasks/{id}/labels/{label_id}`
- Filtering/sorting/search query params: repeatable `status[]`, `priority[]`, `created_by`, `assigned_user_id`, `parent_task_id`, `label_id`, `due` (`overdue|today|upcoming|no_due`), `q`, `sort` (`due_date|created_at|updated_at|priority`), `order` (`asc|desc`), `limit`, `offset`.
- Shapes (summary): `TaskSummary` (list) has id/title/status/priority/start_date/due_date/completed_at/parent_task_id/created_by/created_at/updated_at; `TaskResponse` adds description/labels/assignments. Comments, activities, labels, assignments have their own out schemas; statistics returns totals/by_status/by_priority/overdue/due_today/completion_rate.
- Business rules relevant to frontend: status transitions enforced server-side (`todo/in_progress/blocked/done/cancelled`), `done` ⇔ `completed_at`; owner/assignee permissions; owner-only edits/assignment/labels/delete; assignee can change status and comment; one-level subtask visibility model; hard delete semantics.

## 2. Calendar architecture analysis (primary reference)

### 2.1 Module composition (`web/app/calendar/`)
- **Orchestrator page:** `CalendarPage.jsx`
  - Owns view/range/selection/editor/dialog state and refs to FullCalendar/surface/guides
  - Composes toolbar, FullCalendar surface with overlays, side/detail panel, dialogs, confirmation flows, and floating `CalendarAgent`
  - Coordinates data hooks and refresh flows (`reloadEvents`, `detailsRefreshKey`, clearing selection after edits)
- **Presentation/components:**
  - `CalendarToolbar.jsx`: page title + calendar selector + primary create action; navigation group (prev/today/next) + live range label + view selector
  - `CalendarViewSelector.jsx`: button group from `CALENDAR_VIEWS`
  - `CalendarSelector.jsx`: inline loading/error/empty states, populated dropdown menu (color dots, default badge, check, create/manage actions)
  - `CalendarEvent.jsx`: custom event chip content (time/title/recurring indicator)
  - `EventDetailPanel.jsx`: shadcn `Sheet` (right) showing details, reminders CRUD, comments CRUD, edit/delete footer
  - `EventDialog.jsx`: create/edit form in `DialogShell` (complex recurrence/scope/date-time rules, field-level validation, API submit)
  - `CalendarDialog.jsx`: create/edit/delete calendar in `DialogShell`
  - `RecurrenceFields.jsx`: reusable recurrence form section
  - `agent/*`: floating assistant UI scoped to calendar page only
- **State/data hooks (feature-local):**
  - `useCalendars.js`: loads calendars, maintains valid selection, exposes create/update/remove/reload/saving/loading/error
  - `useCalendarEvents.js`: loads occurrences for visible range with request sequencing + abort, maps backend occurrences to FullCalendar events, exposes `setRange`/`reload` and derived events
  - `useEventDetails.js`: loads event/reminders/comments in parallel, owns reminder/comment mutations and per-section errors/busy states
- **API and domain utilities:**
  - `api.js`: thin wrappers around shared `apiRequest` with endpoint-specific fallback messages
  - `views.js`, `categories.js`, `time.js`, `eventDetail.js`, `recurrence.js`, `timeGridGuides.js`: pure/domain helpers and view behavior utilities
- **Styling:**
  - `calendar.css`: large module-scoped stylesheet (`.calendar-page` + FullCalendar selectors + portal-aware overlay classes `cal-dialog/cal-sheet`) defining layout, tokens aliases, controls, grid/event styling, responsive behavior, reduced-motion handling

### 2.2 Architectural patterns to mirror in Tasks
- **Single feature page orchestrator** owning UI state and wiring hooks/components (avoid scattering cross-cutting state).
- **Feature-local `api.js` + `use*` hooks** encapsulating fetch/mutation/loading/error/request-cancellation concerns; components stay mostly presentational.
- **Shared `apiRequest`/`ApiError` usage** with 401 handling (`clearToken` + navigate to login) passed down from page.
- **Dialogs/panels use shared shells** (`DialogShell`, `ConfirmDialog`, `Sheet`) and shared form/state components (`FormField`, `FormError`, `LoadingState`, `EmptyState`, `ErrorState`, `RadioOption`, `IconButton`).
- **Module-scoped styling** for complex view-specific visuals, while preferring Tailwind/theme tokens and existing shared primitives for standard controls/layout.
- **No routing/nav changes inside module implementation**; module lives under existing layout route.

## 3. Proposed Tasks frontend architecture (inside `web/app/task/`)

Design goal: smallest reasonable set of components/hooks with clear separation of concerns, aligned with Calendar conventions and existing backend task contract.

### 3.1 Proposed file/component structure
```
web/app/task/
  TasksPage.jsx                 # Orchestrator: view/filter/selection state, composes UI, refresh/401 handling
  api.js                        # Task feature API wrappers over @/src/api.js (tasks, subtasks, comments, activity, labels, assignments)
  hooks/
    useTasks.js                 # List/query state: scope/filters/sort/pagination, load/reload, abort/race safety
    useTaskDetails.js           # Selected task details + comments + activity + mutations (and optional subtasks/labels/assignments ops)
  components/
    TasksToolbar.jsx            # Header row: title/context, primary "New task" action, view toggles, quick actions
    TasksViewSelector.jsx       # List/Kanban (and future-safe extension) segmented control
    TasksFilters.jsx            # Status/priority/due/scope/search/sort controls (compact, reusable)
    TasksListView.jsx           # Table/list rendering of TaskSummary items + empty/loading/error states
    TasksKanbanView.jsx         # Columnar view grouped by status (using same items/query results)
    TaskCard.jsx                # Compact task item/card (title, status, priority, due, assignees/labels indicators)
    TaskDialog.jsx              # Create/edit task (and optionally subtask/create-with-parent) in DialogShell
    TaskDetailPanel.jsx         # Right-side Sheet: core fields, assignments, subtasks, labels, comments, activity
    TaskSubtasksSection.jsx     # Subtask list + add/promote/detach interactions inside detail/create flows
    TaskCommentsSection.jsx     # Comment list + add/delete (author) inside detail panel
    TaskActivitySection.jsx     # Read-only activity timeline
  utils/
    taskFormat.js               # Date/status/priority/label formatting helpers (pure)
    taskConstants.js            # Status/priority/sort/due option maps aligned with backend
  TasksPage.css (or tasks.css)  # Module-scoped styles only if needed (kanban/list refinements), prefer Tailwind first
  FRONTEND_ARCHITECTURE.md
  FRONTEND_DESIGN_SYSTEM.md
  FRONTEND_COMPONENTS.md
  FRONTEND_INTEGRATION.md
```

Notes:
- Keep hooks minimal: start with `useTasks` and `useTaskDetails`; extract more hooks only if complexity justifies it (e.g. `useTaskLabels` if global label management becomes distinct).
- `TasksFilters` can be a single component with internal sub-sections rather than many tiny filter components.
- Assignment/label management UI can live inside `TaskDetailPanel` sections initially (smallest reasonable abstraction) before extracting dedicated components.

### 3.3 Data/state flow (proposed)
- `TasksPage` owns: active view (`list|kanban`), selected scope/query/filter state, selected task id, dialog open mode/target, refresh keys.
- `useTasks` owns: request lifecycle for `GET /api/tasks` (or scoped endpoints) with query params, pagination, loading/error/empty states, and reload; abort stale requests on filter changes.
- `useTaskDetails` owns: `GET /api/tasks/{id}` plus related collections (`comments`, `activities`, `subtasks`) and mutations; exposes busy/error states per concern similar to `useEventDetails`.
- Mutations trigger targeted reloads (`useTasks.reload`, details refresh) to keep list/detail consistent.
- Unauthorized handling: pass `onUnauthorized` from page (clear token + navigate `/login`) consistent with Calendar.

### 3.4 View/UX scope implied by backend and requirements
- **List view:** filterable/sortable/searchable task list backed by server query params.
- **Kanban view:** status-column presentation (todo/in_progress/blocked/done/cancelled) using task statuses from backend; drag/drop not specified by backend contract and should only be added if it maps cleanly to `PUT /status` (defer unless explicitly requested/approved).
- **Task CRUD:** create (`POST /api/tasks`), edit allowed fields (`PATCH`), delete (owner), status changes (`PUT /status`).
- **Details panel/dialog:** description, dates, priority/status, parent/subtasks, assignments, labels, comments, activity history.
- **Reuse-first UI:** dialogs via `DialogShell`/`ConfirmDialog`, right panel via `Sheet`, controls via existing shadcn/ui inputs/selects/buttons/badges/etc.

## 4. Constraints respected
- Implementation/created files limited to `web/app/task/`.
- No changes to `web/app/calendar`, `web/app/docs`, `web/app/auth`, `web/app/workspace`, `web/app/src`, shared UI components, global styles, or package config.
- No new component library or duplicate dependencies; reuse existing shadcn/shared/Tailwind/theme/FullCalendar-not-needed-for-tasks stack.
- No automated tests/test files.
- Preserve existing functionality and routing; run production build when frontend implementation is complete.
