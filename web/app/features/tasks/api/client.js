import { apiRequest } from '../../../src/api.js'

/**
 * Tasks API client.
 *
 * The task router is mounted at `/api/tasks` (service/task/router.py); that is
 * the only task prefix the backend exposes, and it returns
 * `{ items, total, limit, offset }`.
 */
export function listTasks() {
  return apiRequest('/api/tasks', {
    fallbackMessage: 'Could not load tasks.',
  })
}
