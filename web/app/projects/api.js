import { apiRequest } from '../src/api.js'

function buildQuery(params = {}) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    search.set(key, String(value))
  })
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

export function listProjects(params = {}, options = {}) {
  return apiRequest(`/api/projects${buildQuery(params)}`, {
    fallbackMessage: 'Could not load projects.',
    signal: options.signal,
  })
}

export function getProject(projectId, options = {}) {
  return apiRequest(`/api/projects/${projectId}`, {
    fallbackMessage: 'Could not load the project.',
    signal: options.signal,
  })
}

export function getProjectOverview(projectId, options = {}) {
  return apiRequest(`/api/projects/${projectId}/overview`, {
    fallbackMessage: 'Could not load the project overview.',
    signal: options.signal,
  })
}

export function listProjectMembers(projectId, options = {}) {
  return apiRequest(`/api/projects/${projectId}/members`, {
    fallbackMessage: 'Could not load project members.',
    signal: options.signal,
  })
}

export function updateProjectMemberRole(projectId, memberId, payload) {
  return apiRequest(`/api/projects/${projectId}/members/${memberId}`, {
    method: 'PATCH',
    body: payload,
    fallbackMessage: 'Could not update the member role.',
  })
}

export function removeProjectMember(projectId, memberId) {
  return apiRequest(`/api/projects/${projectId}/members/${memberId}`, {
    method: 'DELETE',
    fallbackMessage: 'Could not remove the project member.',
  })
}

export function listProjectInvitations(projectId, options = {}) {
  return apiRequest(`/api/projects/${projectId}/invitations`, {
    fallbackMessage: 'Could not load project invitations.',
    signal: options.signal,
  })
}

export function createProjectInvitation(projectId, payload) {
  return apiRequest(`/api/projects/${projectId}/invitations`, {
    method: 'POST',
    body: payload,
    fallbackMessage: 'Could not send the invitation.',
  })
}

export function revokeProjectInvitation(projectId, invitationId) {
  return apiRequest(`/api/projects/${projectId}/invitations/${invitationId}/revoke`, {
    method: 'POST',
    fallbackMessage: 'Could not revoke the invitation.',
  })
}

export function listReceivedProjectInvitations(options = {}) {
  return apiRequest('/api/project-invitations', {
    fallbackMessage: 'Could not load your project invitations.',
    signal: options.signal,
  })
}

export function acceptProjectInvitation(invitationId) {
  return apiRequest(`/api/project-invitations/${invitationId}/accept`, {
    method: 'POST',
    fallbackMessage: 'Could not accept the invitation.',
  })
}

export function declineProjectInvitation(invitationId) {
  return apiRequest(`/api/project-invitations/${invitationId}/decline`, {
    method: 'POST',
    fallbackMessage: 'Could not decline the invitation.',
  })
}

// --- Milestones ---

export function listProjectMilestones(projectId, params = {}, options = {}) {
  return apiRequest(`/api/projects/${projectId}/milestones${buildQuery(params)}`, {
    fallbackMessage: 'Could not load milestones.',
    signal: options.signal,
  })
}

export function getProjectMilestone(projectId, milestoneId, options = {}) {
  return apiRequest(`/api/projects/${projectId}/milestones/${milestoneId}`, {
    fallbackMessage: 'Could not load the milestone.',
    signal: options.signal,
  })
}

export function createProjectMilestone(projectId, payload) {
  return apiRequest(`/api/projects/${projectId}/milestones`, {
    method: 'POST',
    body: payload,
    fallbackMessage: 'Could not create the milestone.',
  })
}

export function updateProjectMilestone(projectId, milestoneId, payload) {
  return apiRequest(`/api/projects/${projectId}/milestones/${milestoneId}`, {
    method: 'PATCH',
    body: payload,
    fallbackMessage: 'Could not update the milestone.',
  })
}

export function deleteProjectMilestone(projectId, milestoneId) {
  return apiRequest(`/api/projects/${projectId}/milestones/${milestoneId}`, {
    method: 'DELETE',
    fallbackMessage: 'Could not delete the milestone.',
  })
}

export function reorderProjectMilestones(projectId, payload) {
  return apiRequest(`/api/projects/${projectId}/milestones/reorder`, {
    method: 'PUT',
    body: payload,
    fallbackMessage: 'Could not reorder milestones.',
  })
}

export function createProjectMilestoneStep(projectId, milestoneId, payload) {
  return apiRequest(`/api/projects/${projectId}/milestones/${milestoneId}/steps`, {
    method: 'POST',
    body: payload,
    fallbackMessage: 'Could not add the step.',
  })
}

export function updateProjectMilestoneStep(projectId, milestoneId, stepId, payload) {
  return apiRequest(`/api/projects/${projectId}/milestones/${milestoneId}/steps/${stepId}`, {
    method: 'PATCH',
    body: payload,
    fallbackMessage: 'Could not update the step.',
  })
}

export function deleteProjectMilestoneStep(projectId, milestoneId, stepId) {
  return apiRequest(`/api/projects/${projectId}/milestones/${milestoneId}/steps/${stepId}`, {
    method: 'DELETE',
    fallbackMessage: 'Could not delete the step.',
  })
}

export function completeProjectMilestoneStep(projectId, milestoneId, stepId) {
  return apiRequest(`/api/projects/${projectId}/milestones/${milestoneId}/steps/${stepId}/complete`, {
    method: 'POST',
    fallbackMessage: 'Could not complete the step.',
  })
}

export function reopenProjectMilestoneStep(projectId, milestoneId, stepId) {
  return apiRequest(`/api/projects/${projectId}/milestones/${milestoneId}/steps/${stepId}/reopen`, {
    method: 'POST',
    fallbackMessage: 'Could not reopen the step.',
  })
}

export function reorderProjectMilestoneSteps(projectId, milestoneId, payload) {
  return apiRequest(`/api/projects/${projectId}/milestones/${milestoneId}/steps/reorder`, {
    method: 'PUT',
    body: payload,
    fallbackMessage: 'Could not reorder steps.',
  })
}

export function createProject(payload) {
  return apiRequest('/api/projects', {
    method: 'POST',
    body: payload,
    fallbackMessage: 'Could not create the project.',
  })
}

export function updateProject(projectId, payload) {
  return apiRequest(`/api/projects/${projectId}`, {
    method: 'PATCH',
    body: payload,
    fallbackMessage: 'Could not update the project.',
  })
}

export function archiveProject(projectId) {
  return apiRequest(`/api/projects/${projectId}/archive`, {
    method: 'POST',
    fallbackMessage: 'Could not archive the project.',
  })
}

export function restoreProject(projectId) {
  return apiRequest(`/api/projects/${projectId}/restore`, {
    method: 'POST',
    fallbackMessage: 'Could not restore the project.',
  })
}

export function deleteProject(projectId) {
  return apiRequest(`/api/projects/${projectId}`, {
    method: 'DELETE',
    fallbackMessage: 'Could not delete the project.',
  })
}
