import { apiRequest } from '../src/api.js'

// Calendar and event endpoints mirror service/calendar/router.py exactly.

export function listCalendars() {
  return apiRequest('/calendars', {
    fallbackMessage: 'Could not load calendars.',
  })
}

export function createCalendar({ name, description }) {
  return apiRequest('/calendars', {
    method: 'POST',
    body: { name, description: description || null },
    fallbackMessage: 'Could not create the calendar.',
  })
}

export function updateCalendar(calendarId, updates) {
  return apiRequest(`/calendars/${calendarId}`, {
    method: 'PATCH',
    body: updates,
    fallbackMessage: 'Could not update the calendar.',
  })
}

export function deleteCalendar(calendarId) {
  return apiRequest(`/calendars/${calendarId}`, {
    method: 'DELETE',
    fallbackMessage: 'Could not delete the calendar.',
  })
}

export function listOccurrences(
  calendarId,
  { start, end, timezone, signal } = {},
) {
  const params = new URLSearchParams({ start, end, timezone })
  return apiRequest(`/calendars/${calendarId}/occurrences?${params}`, {
    fallbackMessage: 'Could not load events.',
    signal,
  })
}

export function createEvent(calendarId, payload) {
  return apiRequest(`/calendars/${calendarId}/events`, {
    method: 'POST',
    body: payload,
    fallbackMessage: 'Could not create the event.',
  })
}

export function getEvent(calendarId, eventId) {
  return apiRequest(`/calendars/${calendarId}/events/${eventId}`, {
    fallbackMessage: 'Could not load the event.',
  })
}

export function updateEvent(calendarId, eventId, updates) {
  return apiRequest(`/calendars/${calendarId}/events/${eventId}`, {
    method: 'PATCH',
    body: updates,
    fallbackMessage: 'Could not update the event.',
  })
}

export function deleteEvent(calendarId, eventId) {
  return apiRequest(`/calendars/${calendarId}/events/${eventId}`, {
    method: 'DELETE',
    fallbackMessage: 'Could not delete the event.',
  })
}

/** Recurring occurrence edits: scope is "occurrence", "following" or "series". */
export function editOccurrence(calendarId, eventId, payload) {
  return apiRequest(`/calendars/${calendarId}/events/${eventId}/occurrences`, {
    method: 'PATCH',
    body: payload,
    fallbackMessage: 'Could not update the occurrence.',
  })
}

export function createException(calendarId, eventId, payload) {
  return apiRequest(`/calendars/${calendarId}/events/${eventId}/exceptions`, {
    method: 'POST',
    body: payload,
    fallbackMessage: 'Could not update this occurrence.',
  })
}

export function listReminders(calendarId, eventId) {
  return apiRequest(`/calendars/${calendarId}/events/${eventId}/reminders`, {
    fallbackMessage: 'Could not load reminders.',
  })
}

export function createReminder(calendarId, eventId, minutesBefore) {
  return apiRequest(`/calendars/${calendarId}/events/${eventId}/reminders`, {
    method: 'POST',
    body: { minutes_before: minutesBefore },
    fallbackMessage: 'Could not create the reminder.',
  })
}

export function updateReminder(
  calendarId,
  eventId,
  reminderId,
  minutesBefore,
) {
  return apiRequest(
    `/calendars/${calendarId}/events/${eventId}/reminders/${reminderId}`,
    {
      method: 'PATCH',
      body: { minutes_before: minutesBefore },
      fallbackMessage: 'Could not update the reminder.',
    },
  )
}

export function deleteReminder(calendarId, eventId, reminderId) {
  return apiRequest(
    `/calendars/${calendarId}/events/${eventId}/reminders/${reminderId}`,
    {
      method: 'DELETE',
      fallbackMessage: 'Could not delete the reminder.',
    },
  )
}

export function listComments(calendarId, eventId, { limit = 50 } = {}) {
  return apiRequest(
    `/calendars/${calendarId}/events/${eventId}/comments?limit=${limit}`,
    { fallbackMessage: 'Could not load comments.' },
  )
}

export function createComment(calendarId, eventId, content) {
  return apiRequest(`/calendars/${calendarId}/events/${eventId}/comments`, {
    method: 'POST',
    body: { content },
    fallbackMessage: 'Could not add the comment.',
  })
}

export function deleteComment(calendarId, eventId, commentId) {
  return apiRequest(
    `/calendars/${calendarId}/events/${eventId}/comments/${commentId}`,
    {
      method: 'DELETE',
      fallbackMessage: 'Could not delete the comment.',
    },
  )
}
