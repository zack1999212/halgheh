import { TASK_PRIORITY_MAP, TASK_STATUS_MAP } from './taskConstants.js'

export function statusLabel(status) {
  return TASK_STATUS_MAP.get(status)?.label || status || 'Unknown'
}

export function priorityLabel(priority) {
  return TASK_PRIORITY_MAP.get(priority)?.label || priority || 'Unknown'
}

export function formatDate(value) {
  if (!value) return 'No due date'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    // date-only strings like YYYY-MM-DD
    const parts = String(value).split('-').map(Number)
    if (parts.length === 3 && parts.every(Number.isFinite)) {
      const d = new Date(parts[0], parts[1] - 1, parts[2])
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
      }
    }
    return String(value)
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function isOverdue(task) {
  if (!task?.due_date || task.status === 'done' || task.status === 'cancelled') return false
  const [y, m, d] = String(task.due_date).split('-').map(Number)
  if (!y || !m || !d) return false
  const due = new Date(y, m - 1, d, 23, 59, 59, 999)
  return due.getTime() < Date.now()
}
