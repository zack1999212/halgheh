import { apiRequest } from '../src/api.js'

/** Workspace discussion endpoints (service/discussions/router.py). */

const base = (workspaceId) => `/api/workspaces/${workspaceId}/discussions`

export function listDiscussions(workspaceId, params = {}) {
  const search = new URLSearchParams()
  if (params.type) search.set('type', params.type)
  if (params.limit != null) search.set('limit', String(params.limit))
  if (params.offset != null) search.set('offset', String(params.offset))
  const query = search.toString()
  return apiRequest(`${base(workspaceId)}${query ? `?${query}` : ''}`, {
    fallbackMessage: 'Could not load discussions.',
  })
}

export function createDiscussion(workspaceId, body) {
  return apiRequest(base(workspaceId), {
    method: 'POST',
    body,
    fallbackMessage: 'Could not create the discussion.',
  })
}

export function updateDiscussion(workspaceId, discussionId, body) {
  return apiRequest(`${base(workspaceId)}/${discussionId}`, {
    method: 'PATCH',
    body,
    fallbackMessage: 'Could not update the discussion.',
  })
}

export function deleteDiscussion(workspaceId, discussionId) {
  return apiRequest(`${base(workspaceId)}/${discussionId}`, {
    method: 'DELETE',
    fallbackMessage: 'Could not delete the discussion.',
  })
}

export function pinDiscussion(workspaceId, discussionId, isPinned) {
  return apiRequest(`${base(workspaceId)}/${discussionId}/pin`, {
    method: 'PATCH',
    body: { is_pinned: isPinned },
    fallbackMessage: 'Could not pin the discussion.',
  })
}

export function listReplies(workspaceId, discussionId, params = {}) {
  const search = new URLSearchParams()
  if (params.limit != null) search.set('limit', String(params.limit))
  if (params.offset != null) search.set('offset', String(params.offset))
  const query = search.toString()
  return apiRequest(
    `${base(workspaceId)}/${discussionId}/replies${query ? `?${query}` : ''}`,
    { fallbackMessage: 'Could not load replies.' },
  )
}

export function createReply(workspaceId, discussionId, body) {
  return apiRequest(`${base(workspaceId)}/${discussionId}/replies`, {
    method: 'POST',
    body,
    fallbackMessage: 'Could not add your message.',
  })
}

export function updateReply(workspaceId, discussionId, replyId, body) {
  return apiRequest(`${base(workspaceId)}/${discussionId}/replies/${replyId}`, {
    method: 'PATCH',
    body,
    fallbackMessage: 'Could not update your message.',
  })
}

export function deleteReply(workspaceId, discussionId, replyId) {
  return apiRequest(`${base(workspaceId)}/${discussionId}/replies/${replyId}`, {
    method: 'DELETE',
    fallbackMessage: 'Could not delete your message.',
  })
}

function react(path, emoji, method) {
  return apiRequest(path, {
    method,
    body: { emoji },
    fallbackMessage: 'Could not update your reaction.',
  })
}

export const addDiscussionReaction = (workspaceId, discussionId, emoji) =>
  react(`${base(workspaceId)}/${discussionId}/reactions`, emoji, 'POST')

export const removeDiscussionReaction = (workspaceId, discussionId, emoji) =>
  react(`${base(workspaceId)}/${discussionId}/reactions`, emoji, 'DELETE')

export const addReplyReaction = (workspaceId, discussionId, replyId, emoji) =>
  react(
    `${base(workspaceId)}/${discussionId}/replies/${replyId}/reactions`,
    emoji,
    'POST',
  )

export const removeReplyReaction = (workspaceId, discussionId, replyId, emoji) =>
  react(
    `${base(workspaceId)}/${discussionId}/replies/${replyId}/reactions`,
    emoji,
    'DELETE',
  )
