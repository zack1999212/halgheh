import { TASK_PRIORITY_MAP, TASK_STATUS_MAP } from './taskConstants.js'

export function statusLabel(status) {
  return TASK_STATUS_MAP.get(status)?.label || status || 'Unknown'
}

export function priorityLabel(priority) {
  return TASK_PRIORITY_MAP.get(priority)?.label || priority || 'Unknown'
}

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function parseDateOnly(value) {
  if (typeof value !== 'string') return null
  const match = DATE_ONLY_RE.exec(value.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }
  return date
}

export function formatDate(value) {
  if (!value) return 'No due date'
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return String(value)
    return value.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const dateOnly = parseDateOnly(String(value))
  if (dateOnly) {
    return dateOnly.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
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
  const due = parseDateOnly(String(task.due_date))
  if (!due) return false
  due.setHours(23, 59, 59, 999)
  return due.getTime() < Date.now()
}
