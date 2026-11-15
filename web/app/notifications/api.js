import { apiRequest } from '../src/api.js'

// Endpoints and fields mirror service/notifications/router.py and schemas.py.

export function listNotifications({ limit = 50, offset = 0, unread } = {}) {
  const params = new URLSearchParams()
  params.set('limit', String(limit))
  if (offset) {
    params.set('offset', String(offset))
  }
  if (typeof unread === 'boolean') {
    params.set('unread', String(unread))
  }
  return apiRequest(`/notifications?${params.toString()}`, {
    fallbackMessage: 'Could not load notifications.',
  })
}

export async function getUnreadCount() {
  const data = await apiRequest('/notifications/unread-count', {
    fallbackMessage: 'Could not load the unread notification count.',
  })
  return Number(data?.count) || 0
}

export function getNotification(notificationId) {
  return apiRequest(`/notifications/${notificationId}`, {
    fallbackMessage: 'Could not load the notification.',
  })
}

export function markNotificationRead(notificationId) {
  return apiRequest(`/notifications/${notificationId}/read`, {
    method: 'PATCH',
    fallbackMessage: 'Could not mark the notification as read.',
  })
}

export function markNotificationUnread(notificationId) {
  return apiRequest(`/notifications/${notificationId}/unread`, {
    method: 'PATCH',
    fallbackMessage: 'Could not mark the notification as unread.',
  })
}

export function markAllNotificationsRead() {
  return apiRequest('/notifications/read-all', {
    method: 'POST',
    fallbackMessage: 'Could not mark notifications as read.',
  })
}

export function deleteNotification(notificationId) {
  return apiRequest(`/notifications/${notificationId}`, {
    method: 'DELETE',
    fallbackMessage: 'Could not delete the notification.',
  })
}

export function deleteAllNotifications() {
  return apiRequest('/notifications', {
    method: 'DELETE',
    fallbackMessage: 'Could not delete notifications.',
  })
}

export function getNotificationPreferences() {
  return apiRequest('/notifications/preferences', {
    fallbackMessage: 'Could not load notification preferences.',
  })
}

export function updateNotificationPreferences(updates) {
  return apiRequest('/notifications/preferences', {
    method: 'PATCH',
    body: updates,
    fallbackMessage: 'Could not update notification preferences.',
  })
}
