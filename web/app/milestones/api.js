import { apiRequest } from '../src/api.js'

/** Workspace milestone endpoints (service/milestone/router.py). */

export function listMilestones(workspaceId, params = {}) {
  const search = new URLSearchParams()
  if (params.limit != null) search.set('limit', String(params.limit))
  if (params.offset != null) search.set('offset', String(params.offset))
  const query = search.toString()
  return apiRequest(
    `/api/workspaces/${workspaceId}/milestones${query ? `?${query}` : ''}`,
    { fallbackMessage: 'Could not load milestones.' },
  )
}

export function getMilestone(workspaceId, milestoneId) {
  return apiRequest(
    `/api/workspaces/${workspaceId}/milestones/${milestoneId}`,
    { fallbackMessage: 'Could not load this milestone.' },
  )
}

export function createMilestone(workspaceId, body) {
  return apiRequest(`/api/workspaces/${workspaceId}/milestones`, {
    method: 'POST',
    body,
    fallbackMessage: 'Could not create the milestone.',
  })
}

export function deleteMilestone(workspaceId, milestoneId) {
  return apiRequest(
    `/api/workspaces/${workspaceId}/milestones/${milestoneId}`,
    { method: 'DELETE', fallbackMessage: 'Could not delete the milestone.' },
  )
}
