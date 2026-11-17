import { apiRequest } from '../../../src/api.js'

/**
 * Tasks API client. Uses the existing backend endpoint as-is.
 * Backend (service/task/router.py): GET /tasks/ -> { items: [] }
 */
export function listTasks() {
  return apiRequest('/tasks/', {
    fallbackMessage: 'Could not load tasks.',
  })
}
