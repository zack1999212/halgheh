export const TASK_STATUSES = [
  { id: 'todo', label: 'To Do' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'done', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
]

export const TASK_STATUS_MAP = new Map(TASK_STATUSES.map((s) => [s.id, s]))

export const TASK_PRIORITIES = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'urgent', label: 'Urgent' },
]

export const TASK_PRIORITY_MAP = new Map(TASK_PRIORITIES.map((p) => [p.id, p]))

export const SORT_OPTIONS = [
  { id: 'updated_at', label: 'Updated' },
  { id: 'created_at', label: 'Created' },
  { id: 'due_date', label: 'Due date' },
  { id: 'priority', label: 'Priority' },
]

export const ORDER_OPTIONS = [
  { id: 'desc', label: 'Newest first' },
  { id: 'asc', label: 'Oldest first' },
]

export const DUE_FILTERS = [
  { id: '', label: 'Any due date' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'today', label: 'Due today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'no_due', label: 'No due date' },
]

/**
 * Navigation presets supported by the backend task API.
 * "Team Tasks" is intentionally omitted: no team model/endpoint is exposed by
 * the current backend contract.
 */
export const TASK_NAV_ITEMS = [
  { id: 'visible', label: 'All tasks', scope: 'visible' },
  { id: 'my', label: 'My Tasks', scope: 'assigned' },
  { id: 'assigned_by_me', label: 'Assigned by Me', scope: 'assigned_by' },
  { id: 'in_progress', label: 'In Progress', scope: 'visible', status: 'in_progress' },
  { id: 'completed', label: 'Completed', scope: 'visible', status: 'done' },
  { id: 'overdue', label: 'Overdue', scope: 'visible', due: 'overdue' },
]

export const KANBAN_COLUMNS = TASK_STATUSES.map((s) => ({ ...s }))
