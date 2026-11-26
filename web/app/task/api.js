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

export function listTasks(params = {}, options = {}) {
  return apiRequest(`/api/tasks${buildQuery(params)}`, {
    fallbackMessage: 'Could not load tasks.',
    signal: options.signal,
  })
}

export function listMyTasks(params = {}, options = {}) {
  return apiRequest(`/api/tasks/my${buildQuery(params)}`, {
    fallbackMessage: 'Could not load your tasks.',
    signal: options.signal,
  })
}

export function listAssignedByMeTasks(params = {}, options = {}) {
  return apiRequest(`/api/tasks/assigned-by-me${buildQuery(params)}`, {
    fallbackMessage: 'Could not load tasks assigned by you.',
    signal: options.signal,
  })
}

export function getTask(taskId, options = {}) {
  return apiRequest(`/api/tasks/${taskId}`, {
    fallbackMessage: 'Could not load the task.',
    signal: options.signal,
  })
}

export function getTaskStatistics(options = {}) {
  return apiRequest('/api/tasks/statistics', {
    fallbackMessage: 'Could not load task statistics.',
    signal: options.signal,
  })
}

export function createTask(payload) {
  return apiRequest('/api/tasks', {
    method: 'POST',
    body: payload,
    fallbackMessage: 'Could not create the task.',
  })
}

export function updateTask(taskId, payload) {
  return apiRequest(`/api/tasks/${taskId}`, {
    method: 'PATCH',
    body: payload,
    fallbackMessage: 'Could not update the task.',
  })
}

export function deleteTask(taskId) {
  return apiRequest(`/api/tasks/${taskId}`, {
    method: 'DELETE',
    fallbackMessage: 'Could not delete the task.',
  })
}

export function updateTaskStatus(taskId, status) {
  return apiRequest(`/api/tasks/${taskId}/status`, {
    method: 'PUT',
    body: { status },
    fallbackMessage: 'Could not update task status.',
  })
}

export function updateTaskPosition(taskId, payload) {
  return apiRequest(`/api/tasks/${taskId}/position`, {
    method: 'PATCH',
    body: payload,
    fallbackMessage: 'Could not reorder the task.',
  })
}

export function setTaskParent(taskId, parentTaskId) {
  return apiRequest(`/api/tasks/${taskId}/parent`, {
    method: 'PUT',
    body: { parent_task_id: parentTaskId ?? null },
    fallbackMessage: 'Could not update the parent task.',
  })
}

export function getTaskParent(taskId, options = {}) {
  return apiRequest(`/api/tasks/${taskId}/parent`, {
    fallbackMessage: 'Could not load the parent task.',
    signal: options.signal,
  })
}

export function listSubtasks(taskId, params = {}, options = {}) {
  return apiRequest(`/api/tasks/${taskId}/subtasks${buildQuery(params)}`, {
    fallbackMessage: 'Could not load subtasks.',
    signal: options.signal,
  })
}

export function createSubtask(taskId, payload) {
  return apiRequest(`/api/tasks/${taskId}/subtasks`, {
    method: 'POST',
    body: payload,
    fallbackMessage: 'Could not create the subtask.',
  })
}

export function listComments(taskId, params = {}, options = {}) {
  return apiRequest(`/api/tasks/${taskId}/comments${buildQuery(params)}`, {
    fallbackMessage: 'Could not load comments.',
    signal: options.signal,
  })
}

export function createComment(taskId, content) {
  return apiRequest(`/api/tasks/${taskId}/comments`, {
    method: 'POST',
    body: { content },
    fallbackMessage: 'Could not add the comment.',
  })
}

export function deleteComment(taskId, commentId) {
  return apiRequest(`/api/tasks/${taskId}/comments/${commentId}`, {
    method: 'DELETE',
    fallbackMessage: 'Could not delete the comment.',
  })
}

export function listActivities(taskId, params = {}, options = {}) {
  return apiRequest(`/api/tasks/${taskId}/activities${buildQuery(params)}`, {
    fallbackMessage: 'Could not load activity history.',
    signal: options.signal,
  })
}

export function listLabels(params = {}, options = {}) {
  return apiRequest(`/api/tasks/labels${buildQuery(params)}`, {
    fallbackMessage: 'Could not load labels.',
    signal: options.signal,
  })
}

export function attachLabel(taskId, labelId) {
  return apiRequest(`/api/tasks/${taskId}/labels/${labelId}`, {
    method: 'PUT',
    fallbackMessage: 'Could not attach the label.',
  })
}

export function detachLabel(taskId, labelId) {
  return apiRequest(`/api/tasks/${taskId}/labels/${labelId}`, {
    method: 'DELETE',
    fallbackMessage: 'Could not detach the label.',
  })
}

export function addAssignment(taskId, assignedUserId) {
  return apiRequest(`/api/tasks/${taskId}/assignments`, {
    method: 'POST',
    body: { assigned_user_id: assignedUserId },
    fallbackMessage: 'Could not add the assignee.',
  })
}

export function replaceAssignment(taskId, assignedUserId) {
  return apiRequest(`/api/tasks/${taskId}/assignee`, {
    method: 'PUT',
    body: { assigned_user_id: assignedUserId },
    fallbackMessage: 'Could not update the assignee.',
  })
}

export function removeAssignment(taskId, userId) {
  return apiRequest(`/api/tasks/${taskId}/assignments/${userId}`, {
    method: 'DELETE',
    fallbackMessage: 'Could not remove the assignee.',
  })
}

export function listChecklistItems(taskId, options = {}) {
  return apiRequest(`/api/tasks/${taskId}/checklist`, {
    fallbackMessage: 'Could not load checklist.',
    signal: options.signal,
  })
}

export function createChecklistItem(taskId, payload) {
  return apiRequest(`/api/tasks/${taskId}/checklist`, {
    method: 'POST',
    body: payload,
    fallbackMessage: 'Could not create checklist item.',
  })
}

export function updateChecklistItem(taskId, itemId, payload) {
  return apiRequest(`/api/tasks/${taskId}/checklist/${itemId}`, {
    method: 'PATCH',
    body: payload,
    fallbackMessage: 'Could not update checklist item.',
  })
}

export function deleteChecklistItem(taskId, itemId) {
  return apiRequest(`/api/tasks/${taskId}/checklist/${itemId}`, {
    method: 'DELETE',
    fallbackMessage: 'Could not delete checklist item.',
  })
}

export function reorderChecklistItems(taskId, payload) {
  return apiRequest(`/api/tasks/${taskId}/checklist/reorder`, {
    method: 'PATCH',
    body: payload,
    fallbackMessage: 'Could not reorder checklist items.',
  })
}

// --- Workspace sharing -----------------------------------------------------

export function listTaskWorkspaces(taskId, params = {}, options = {}) {
  return apiRequest(`/api/tasks/${taskId}/workspaces${buildQuery(params)}`, {
    fallbackMessage: 'Could not load shared workspaces.',
    signal: options.signal,
  })
}

export function shareTaskWithWorkspace(taskId, workspaceId, permissionLevel = 'viewer', params = {}) {
  return apiRequest(
    `/api/tasks/${taskId}/workspaces/${workspaceId}${buildQuery({ permission_level: permissionLevel, ...params })}`,
    {
      method: 'POST',
      fallbackMessage: 'Could not share the task.',
    },
  )
}

export function updateTaskWorkspacePermission(taskId, workspaceId, permissionLevel, params = {}) {
  return apiRequest(
    `/api/tasks/${taskId}/workspaces/${workspaceId}${buildQuery({ permission_level: permissionLevel, ...params })}`,
    {
      method: 'PATCH',
      fallbackMessage: 'Could not update the workspace permission.',
    },
  )
}

export function unshareTaskWorkspace(taskId, workspaceId, params = {}) {
  return apiRequest(`/api/tasks/${taskId}/workspaces/${workspaceId}${buildQuery(params)}`, {
    method: 'DELETE',
    fallbackMessage: 'Could not remove the shared workspace.',
  })
}
