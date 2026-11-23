import { apiRequest } from '../src/api.js'

export function listWorkspaces({ limit = 100, offset = 0 } = {}) {
  return apiRequest(`/api/workspaces?limit=${limit}&offset=${offset}`, {
    fallbackMessage: 'Could not load workspaces.',
  })
}

export function createWorkspace({ name, description } = {}) {
  return apiRequest('/api/workspaces', {
    method: 'POST',
    body: { name, description: description ?? null },
    fallbackMessage: 'Could not create the workspace.',
  })
}
