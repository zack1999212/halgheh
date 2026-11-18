import { useCallback, useEffect, useMemo, useState } from 'react'
import { listTasks } from '../../features/tasks/api/client.js'
import { getBrowserTimeZone } from '../../calendar/time.js'

function toArray(value) {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.items)) return value.items
  return []
}

function localDateString(date = new Date(), timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).formatToParts(date)
  const map = {}
  for (const p of parts) map[p.type] = p.value
  return `${map.year}-${map.month}-${map.day}`
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

function isCompleted(task) {
  if (!task || typeof task !== 'object') return false
  if (task.completed === true || task.is_completed === true || task.done === true) return true
  const status = String(task.status || task.state || '').toLowerCase()
  return status === 'completed' || status === 'done' || status === 'cancelled' || status === 'canceled'
}

function isActive(task) {
  return !isCompleted(task)
}

function parseTaskDate(task) {
  if (!task || typeof task !== 'object') return null
  // Prefer explicit date-only fields, then due/start timestamps.
  const dateOnly = task.due_date || task.date || task.start_date
  if (typeof dateOnly === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateOnly)) {
    return dateOnly.slice(0, 10)
  }
  const ts = task.due_at || task.dueDate || task.start_at || task.startAt || task.end_at
  if (typeof ts === 'string' && ts) {
    const d = new Date(ts)
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  }
  return null
}

function compareTasks(a, b) {
  const da = parseTaskDate(a) || '9999-12-31'
  const db = parseTaskDate(b) || '9999-12-31'
  if (da !== db) return da.localeCompare(db)
  const pa = Number(a?.priority ?? 0)
  const pb = Number(b?.priority ?? 0)
  if (pa !== pb) return pb - pa
  return String(a?.title || a?.name || '').localeCompare(String(b?.title || b?.name || ''))
}

/**
 * Loads tasks for the workspace dashboard from the existing backend.
 * The current backend exposes GET /tasks/ -> { items: [] } with no task
 * model/fields; derivations are defensive and based only on returned data.
 */
export default function useWorkspaceTasksData({ onUnauthorized } = {}) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const timeZone = useMemo(() => getBrowserTimeZone(), [])
  const todayStr = useMemo(() => localDateString(new Date(), timeZone), [timeZone])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await listTasks()
      setTasks(toArray(data))
    } catch (err) {
      if (err?.status === 401) {
        onUnauthorized?.()
        return
      }
      setError(err?.message || 'Could not load tasks.')
      setTasks([])
    } finally {
      setLoading(false)
    }
  }, [onUnauthorized])

  useEffect(() => {
    load()
  }, [load])

  const derived = useMemo(() => {
    const active = tasks.filter(isActive)
    const endStr = addDays(todayStr, 7)
    const todayTasks = active.filter((t) => parseTaskDate(t) === todayStr).sort(compareTasks)
    const upcomingTasks = active
      .filter((t) => {
        const d = parseTaskDate(t)
        return d && d > todayStr && d <= endStr
      })
      .sort(compareTasks)

    // Overdue: active task with a due date before today (date-based).
    const overdueCount = active.filter((t) => {
      const d = parseTaskDate(t)
      return d && d < todayStr
    }).length

    return {
      timeZone,
      todayStr,
      activeCount: active.length,
      overdueCount,
      todayTasks,
      upcomingTasks,
    }
  }, [tasks, timeZone, todayStr])

  return {
    tasks,
    loading,
    error,
    reload: load,
    ...derived,
  }
}
