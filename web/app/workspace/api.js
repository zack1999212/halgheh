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

export function listWorkspaceMembers(workspaceId) {
  return apiRequest(`/api/workspaces/${workspaceId}/members`, {
    fallbackMessage: 'Could not load workspace members.',
  })
}

export function leaveWorkspace(workspaceId) {
  return apiRequest(`/api/workspaces/${workspaceId}/leave`, {
    method: 'POST',
    fallbackMessage: 'Could not leave the workspace.',
  })
}

export function listWorkspaceActivity(workspaceId, { category, actorId, limit = 20, offset = 0 } = {}) {
  const params = new URLSearchParams()
  if (category) params.set('category', category)
  if (actorId != null) params.set('actor_id', String(actorId))
  params.set('limit', String(limit))
  params.set('offset', String(offset))
  return apiRequest(`/api/workspaces/${workspaceId}/activity?${params.toString()}`, {
    fallbackMessage: 'Could not load activity.',
  })
}

export function listAllWorkspaceActivity({ category, actorId, limit = 20, offset = 0 } = {}) {
  const params = new URLSearchParams()
  if (category) params.set('category', category)
  if (actorId != null) params.set('actor_id', String(actorId))
  params.set('limit', String(limit))
  params.set('offset', String(offset))
  return apiRequest(`/api/workspaces/activity?${params.toString()}`, {
    fallbackMessage: 'Could not load activity.',
  })
}

export function listWorkspaceInvitations(workspaceId) {
  return apiRequest(`/api/workspaces/${workspaceId}/invitations`, {
    fallbackMessage: 'Could not load workspace invitations.',
  })
}

export function createWorkspaceInvitation(workspaceId, { username, role }) {
  return apiRequest(`/api/workspaces/${workspaceId}/invitations`, {
    method: 'POST',
    body: { username, role },
    fallbackMessage: 'Could not send the invitation.',
  })
}

export function revokeWorkspaceInvitation(workspaceId, invitationId) {
  return apiRequest(`/api/workspaces/${workspaceId}/invitations/${invitationId}/revoke`, {
    method: 'POST',
    fallbackMessage: 'Could not revoke the invitation.',
  })
}

export function listReceivedWorkspaceInvitations() {
  return apiRequest('/api/workspace-invitations', {
    fallbackMessage: 'Could not load your invitations.',
  })
}

export function acceptWorkspaceInvitation(invitationId) {
  return apiRequest(`/api/workspace-invitations/${invitationId}/accept`, {
    method: 'POST',
    fallbackMessage: 'Could not accept the invitation.',
  })
}

export function declineWorkspaceInvitation(invitationId) {
  return apiRequest(`/api/workspace-invitations/${invitationId}/decline`, {
    method: 'POST',
    fallbackMessage: 'Could not decline the invitation.',
  })
}
