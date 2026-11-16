import { apiRequest } from '../../src/api.js'

// These endpoints mirror service/agent/router.py. The Calendar Agent is the
// only agent used by this interface; Tasks and Documents have their own
// namespaces and are intentionally never referenced here.
export const CALENDAR_AGENT_ID = 'calendar'

function agentPath(agentId = CALENDAR_AGENT_ID) {
  return `/agents/${encodeURIComponent(agentId)}`
}

export function listConversations(
  agentId = CALENDAR_AGENT_ID,
  { limit = 50, offset = 0 } = {},
) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  })
  return apiRequest(`${agentPath(agentId)}/conversations?${params}`, {
    fallbackMessage: 'Could not load conversations.',
  })
}

export function createConversation(
  agentId = CALENDAR_AGENT_ID,
  { title = null, timezone = null } = {},
) {
  const body = {}
  if (title) body.title = title
  if (timezone) body.timezone = timezone
  return apiRequest(`${agentPath(agentId)}/conversations`, {
    method: 'POST',
    body,
    fallbackMessage: 'Could not start a conversation.',
  })
}

export function getConversation(agentId, conversationId) {
  return apiRequest(`${agentPath(agentId)}/conversations/${conversationId}`, {
    fallbackMessage: 'Could not load this conversation.',
  })
}

export function renameConversation(agentId, conversationId, title) {
  return apiRequest(`${agentPath(agentId)}/conversations/${conversationId}`, {
    method: 'PATCH',
    body: { title },
    fallbackMessage: 'Could not rename the conversation.',
  })
}

export function deleteConversation(agentId, conversationId) {
  return apiRequest(`${agentPath(agentId)}/conversations/${conversationId}`, {
    method: 'DELETE',
    fallbackMessage: 'Could not delete the conversation.',
  })
}

export function sendMessage(agentId, conversationId, content) {
  return apiRequest(
    `${agentPath(agentId)}/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      body: { content },
      fallbackMessage: 'The assistant could not respond. Please try again.',
    },
  )
}

export function listPendingActions(agentId, conversationId) {
  const params = new URLSearchParams({
    conversation_id: String(conversationId),
  })
  return apiRequest(`${agentPath(agentId)}/pending-actions?${params}`, {
    fallbackMessage: 'Could not load pending actions.',
  })
}

export function approvePendingAction(agentId, actionId) {
  return apiRequest(
    `${agentPath(agentId)}/pending-actions/${actionId}/approve`,
    {
      method: 'POST',
      fallbackMessage: 'Could not approve this action.',
    },
  )
}

export function rejectPendingAction(agentId, actionId) {
  return apiRequest(
    `${agentPath(agentId)}/pending-actions/${actionId}/reject`,
    {
      method: 'POST',
      fallbackMessage: 'Could not reject this action.',
    },
  )
}
