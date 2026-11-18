# Tasks Frontend Components

This document inventories the **existing** reusable UI components and Calendar component patterns, and proposes the Tasks component structure (smallest reasonable set) to be implemented inside `web/app/task/`.

## 1. Existing shadcn/ui components available for reuse (`web/app/src/components/ui/`)
(Inspected from `web/app/src/components/ui/`)

- `alert.jsx` — alert containers/descriptions (used by `ErrorState`, `FormError`, dialog warnings)
- `avatar.jsx`
- `badge.jsx` — status/meta chips
- `button.jsx` — primary/secondary/outline/ghost/destructive/icon variants and sizes
- `card.jsx`
- `checkbox.jsx`
- `dialog.jsx` — Radix-based dialog primitives (wrapped by shared `DialogShell`)
- `dropdown-menu.jsx` — menus/selectors (used by `CalendarSelector`)
- `input.jsx`
- `label.jsx`
- `scroll-area.jsx`
- `select.jsx` — Radix select (used in calendar forms/reminders)
- `separator.jsx`
- `sheet.jsx` — side panel primitive (used by `EventDetailPanel`)
- `sidebar.jsx` — app shell/sidebar primitives
- `skeleton.jsx`
- `textarea.jsx`
- `tooltip.jsx`

## 2. Existing shared components available for reuse (`web/app/src/components/shared/`)
(Inspected from source)

- `DialogShell.jsx`
  - Props/use: `open`, `title`, `description`, `onClose`, `children`, optional `footer`, `wide`, `contentClassName`
  - Provides focus trap/Escape/scroll lock via shadcn Dialog, consistent header/body/footer layout, scrollable body, viewport-safe sizing
- `ConfirmDialog.jsx`
  - Built on `DialogShell`; supports destructive/non-destructive confirm, `busy`, `error`, custom body/children
  - Disables dismissal/buttons while busy to prevent duplicate actions
- `FormField.jsx` (+ exports `fieldInputClass`, `fieldInvalidClass`, `FieldMessage`)
  - Label/control/hint/error layout with render-prop child receiving `id`, `aria-invalid`, `aria-describedby`
- `FormError.jsx` — form/action-level destructive alert, renders nothing when empty
- `RadioOption.jsx` — selectable radio card with title/description, native radio behavior, checked styling
- `IconButton.jsx` — accessible icon-only button (required `label`, optional tooltip/side) using ghost icon button style
- `EmptyState.jsx` — optional icon, title, description, action slot
- `ErrorState.jsx` — destructive alert with optional title/message/retry action
- `LoadingState.jsx` — status label + skeleton lines for compact loading surfaces

## 3. Calendar component inventory (reference patterns)

### 3.1 Page and layout/orchestration
- `CalendarPage.jsx` — top-level orchestrator: refs (`calendarRef`, `surfaceRef`, `guidesRef`), view/range/selection state, editor/dialog/delete/drag-scope state, hook wiring, FullCalendar event handlers, overlays, refresh coordination, agent mount.

### 3.2 Toolbar/navigation/filter-like controls
- `CalendarToolbar.jsx` — title, `CalendarSelector`, primary create button, prev/today/next controls, live range label, `CalendarViewSelector`.
- `CalendarViewSelector.jsx` — segmented view buttons from `views.js` definitions.
- `CalendarSelector.jsx` — data-aware selector with loading/error/empty inline states and populated dropdown actions.

### 3.3 Views and item rendering
- FullCalendar integration in `CalendarPage.jsx` (month/week/day/list views configured via plugins/view types/options).
- `CalendarEvent.jsx` — custom event chip renderer (timed/all-day/recurring presentation).

### 3.4 Dialogs, panels, and detail sub-sections
- `CalendarDialog.jsx` — create/edit/delete calendar dialog (DialogShell + form fields + inline delete confirmation state).
- `EventDialog.jsx` — complex create/edit event dialog (scope handling for recurring events, validation, date/time/recurrence/category/calendar selection, API submit).
- `EventDetailPanel.jsx` — right `Sheet` with event details, reminders, comments, edit/delete actions.
- `RecurrenceFields.jsx` — reusable recurrence editor section.
- `ConfirmDialog` (shared) used for delete and drag/resize scope confirmation.

### 3.5 Hooks/API/utilities (feature-local)
- Hooks: `useCalendars.js`, `useCalendarEvents.js`, `useEventDetails.js`.
- API: `calendar/api.js` (wrappers over shared `apiRequest`).
- Utils/domain: `views.js`, `categories.js`, `time.js`, `eventDetail.js`, `recurrence.js`, `timeGridGuides.js`, `api.js` helpers/mappers in hooks.

## 4. Proposed Tasks component structure (inside `web/app/task/`)

Design principle: mirror Calendar's separation (orchestrator page + feature hooks/api + focused UI components) with the smallest reasonable number of components.

### 4.1 Core files/components
| Component/file | Responsibility | Likely reuse/building blocks |
|---|---|---|
| `TasksPage.jsx` | Orchestrator: view/scope/filter/sort/search/selection state, dialog/panel state, unauthorized handling, compose toolbar/views/dialog/panel, coordinate reloads | React state/hooks, `clearToken`/navigate pattern, `LoadingState/EmptyState/ErrorState`, `Sheet`, `DialogShell`/`ConfirmDialog` |
| `TasksToolbar.jsx` | Page header and actions: title/context, `TasksViewSelector`, primary "New task", optional quick scope/search entry points | `Button`, Lucide icons, layout patterns from `CalendarToolbar` |
| `TasksViewSelector.jsx` | Switch between `list` and `kanban` views (segmented control) | `Button` group pattern from `CalendarViewSelector` |
| `TasksFilters.jsx` | Filter/search/sort controls (status/priority/due/scope/assignee/label/search/sort/order as applicable) | `Select`, `Input`, `Badge`, `Button`, `DropdownMenu`/popover-like patterns if needed |
| `TasksListView.jsx` | Render paginated/filterable list of tasks; row interactions/select/edit/delete affordances; empty/loading/error states | `LoadingState`, `EmptyState`, `ErrorState`, `Badge`, `Button`, table/list markup with Tailwind |
| `TasksKanbanView.jsx` | Render tasks grouped by status columns using same dataset/query semantics | `TaskCard`, `Badge`, layout primitives; optional simple status-change actions |
| `TaskCard.jsx` | Compact task representation for list/kanban (title, status/priority, due date, indicators) | `Badge`, `cn`, Lucide icons, button/icon affordances |
| `TaskDialog.jsx` | Create/edit task (and subtask creation context if included) in `DialogShell`; client-side validation aligned to backend rules | `DialogShell`, `FormField/FormError/fieldInputClass`, `Input/Textarea/Select/Button/Label` |
| `TaskDetailPanel.jsx` | Selected task details in right `Sheet`: core info/actions and composed sections (assignments, subtasks, comments, activity, labels) | `Sheet`, `ScrollArea`, `Badge`, `Button`, `IconButton`, `LoadingState/ErrorState` |

### 4.2 Optional focused sections (extract only if needed to keep files small/clear)
| Component/file | Responsibility | Notes |
|---|---|---|
| `TaskSubtasksSection.jsx` | List/create/manage subtasks and parent relationships in detail/dialog contexts | Uses task/subtask endpoints; keep logic simple |
| `TaskCommentsSection.jsx` | Comment thread, add comment, delete own comment | Mirrors `EventDetailPanel` comments UX patterns |
| `TaskActivitySection.jsx` | Read-only activity history timeline/list | Render from `/activities` items |
| `TaskAssignmentSection.jsx` (optional) | View/manage assignees (owner actions) | Can start inline in `TaskDetailPanel` |
| `TaskLabelsSection.jsx` (optional) | Attach/detach labels, possibly create/select existing labels | Depends on desired UX; backend supports label CRUD and task-label attach/detach |

### 4.3 Hooks and API modules (proposed, feature-local)
| File | Responsibility | Reference pattern |
|---|---|---|
| `api.js` | Thin wrappers over `@/src/api.js` for `/api/tasks` endpoints (tasks, stats/views, status/parent, subtasks, assignments, comments, activities, labels) | `calendar/api.js` |
| `hooks/useTasks.js` | Fetch tasks with query params/scope/pagination/sort/filter; manage loading/error/data/total; abort stale requests; reload | `useCalendarEvents.js` / `useCalendars.js` patterns |
| `hooks/useTaskDetails.js` | Fetch task detail + related collections; mutations for comments/status/assignments/labels/subtasks as needed; per-area busy/error states | `useEventDetails.js` |
| `utils/taskConstants.js` | Status/priority/due/sort option definitions aligned to backend enums/query values | `views.js` / `categories.js` style constants |
| `utils/taskFormat.js` | Formatting helpers (dates, labels, relative/due display) | `eventDetail.js` / `time.js` helper style |

## 5. Reuse guidance (must follow)
- **Reuse before creating:** prefer existing `src/components/ui/*` and `src/components/shared/*` for controls, dialogs, sheets, states, form primitives, menus/selects, badges, tooltips.
- **Calendar as pattern, not dependency:** copy architectural/compositional patterns and styling conventions; do not import from `web/app/calendar/` or modify it.
- **No unnecessary abstractions:** only extract sections/hooks/components when they reduce complexity or are clearly reused; keep initial implementation compact.
- **Icons:** Lucide React via existing usage conventions.
- **Styling:** Tailwind utilities + theme tokens/CSS variables; module-scoped CSS only inside `web/app/task/` if required.
