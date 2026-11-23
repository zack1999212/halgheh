import { apiRequest } from '../../../src/api.js'

/**
 * Tasks API client.
 *
 * The task router is mounted at `/api/tasks` (service/task/router.py); that is
 * the only task prefix the backend exposes, and it returns
 * `{ items, total, limit, offset }`.
 */
export function listTasks(params = {}) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null && item !== '') search.append(key, String(item))
      }
      continue
    }
    search.set(key, String(value))
  }
  const qs = search.toString()
  return apiRequest(`/api/tasks${qs ? `?${qs}` : ''}`, {
    fallbackMessage: 'Could not load tasks.',
  })
}
