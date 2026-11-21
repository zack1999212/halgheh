import { apiRequest } from '../src/api.js'

function buildQuery(params = {}) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    if (Array.isArray(value)) {
      value.filter((v) => v !== undefined && v !== null && v !== '').forEach((v) => search.append(key, String(v)))
      return
    }
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

// --- Activity ---

export function listProjectActivity(projectId, params = {}, options = {}) {
  return apiRequest(`/api/projects/${projectId}/activity${buildQuery(params)}`, {
    fallbackMessage: 'Could not load project activity.',
    signal: options.signal,
  })
}

// --- Discussions ---

export function listProjectDiscussions(projectId, params = {}, options = {}) {
  return apiRequest(`/api/projects/${projectId}/discussions${buildQuery(params)}`, {
    fallbackMessage: 'Could not load discussions.',
    signal: options.signal,
  })
}

export function createProjectDiscussion(projectId, payload) {
  return apiRequest(`/api/projects/${projectId}/discussions`, {
    method: 'POST',
    body: payload,
    fallbackMessage: 'Could not create the discussion.',
  })
}

export function getProjectDiscussion(projectId, discussionId, options = {}) {
  return apiRequest(`/api/projects/${projectId}/discussions/${discussionId}`, {
    fallbackMessage: 'Could not load the discussion.',
    signal: options.signal,
  })
}

export function updateProjectDiscussion(projectId, discussionId, payload) {
  return apiRequest(`/api/projects/${projectId}/discussions/${discussionId}`, {
    method: 'PATCH',
    body: payload,
    fallbackMessage: 'Could not update the discussion.',
  })
}

export function deleteProjectDiscussion(projectId, discussionId) {
  return apiRequest(`/api/projects/${projectId}/discussions/${discussionId}`, {
    method: 'DELETE',
    fallbackMessage: 'Could not delete the discussion.',
  })
}

export function pinProjectDiscussion(projectId, discussionId, payload) {
  return apiRequest(`/api/projects/${projectId}/discussions/${discussionId}/pin`, {
    method: 'PATCH',
    body: payload,
    fallbackMessage: 'Could not update the discussion pin state.',
  })
}

export function listProjectDiscussionReplies(projectId, discussionId, params = {}, options = {}) {
  return apiRequest(`/api/projects/${projectId}/discussions/${discussionId}/replies${buildQuery(params)}`, {
    fallbackMessage: 'Could not load replies.',
    signal: options.signal,
  })
}

export function createProjectDiscussionReply(projectId, discussionId, payload) {
  return apiRequest(`/api/projects/${projectId}/discussions/${discussionId}/replies`, {
    method: 'POST',
    body: payload,
    fallbackMessage: 'Could not post the reply.',
  })
}

export function updateProjectDiscussionReply(projectId, discussionId, replyId, payload) {
  return apiRequest(`/api/projects/${projectId}/discussions/${discussionId}/replies/${replyId}`, {
    method: 'PATCH',
    body: payload,
    fallbackMessage: 'Could not update the reply.',
  })
}

export function deleteProjectDiscussionReply(projectId, discussionId, replyId) {
  return apiRequest(`/api/projects/${projectId}/discussions/${discussionId}/replies/${replyId}`, {
    method: 'DELETE',
    fallbackMessage: 'Could not delete the reply.',
  })
}

export function addProjectDiscussionReaction(projectId, discussionId, payload) {
  return apiRequest(`/api/projects/${projectId}/discussions/${discussionId}/reactions`, {
    method: 'POST',
    body: payload,
    fallbackMessage: 'Could not add the reaction.',
  })
}

export function removeProjectDiscussionReaction(projectId, discussionId, payload) {
  return apiRequest(`/api/projects/${projectId}/discussions/${discussionId}/reactions`, {
    method: 'DELETE',
    body: payload,
    fallbackMessage: 'Could not remove the reaction.',
  })
}

export function addProjectDiscussionReplyReaction(projectId, discussionId, replyId, payload) {
  return apiRequest(`/api/projects/${projectId}/discussions/${discussionId}/replies/${replyId}/reactions`, {
    method: 'POST',
    body: payload,
    fallbackMessage: 'Could not add the reaction.',
  })
}

export function removeProjectDiscussionReplyReaction(projectId, discussionId, replyId, payload) {
  return apiRequest(`/api/projects/${projectId}/discussions/${discussionId}/replies/${replyId}/reactions`, {
    method: 'DELETE',
    body: payload,
    fallbackMessage: 'Could not remove the reaction.',
  })
}
