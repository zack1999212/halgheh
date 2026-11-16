const TOOL_LABELS = {
  list_events: 'Checked your schedule',
  get_event: 'Read an event',
  search_events: 'Searched events',
  get_calendar_overview: 'Reviewed your calendar',
  create_event: 'Created an event',
  create_recurring_event: 'Created a recurring event',
  update_event: 'Updated an event',
  move_event: 'Moved an event',
  resize_event: 'Resized an event',
  edit_occurrence: 'Updated one occurrence',
  edit_series: 'Updated the series',
  split_series: 'Split the series',
  delete_event: 'Deleted an event',
  delete_occurrence: 'Cancelled an occurrence',
  delete_series: 'Deleted the series',
  list_reminders: 'Read reminders',
  create_reminder: 'Added a reminder',
  update_reminder: 'Updated a reminder',
  delete_reminder: 'Deleted a reminder',
  find_free_slots: 'Found free time',
}

const WRITE_TOOLS = new Set([
  'create_event',
  'create_recurring_event',
  'update_event',
  'move_event',
  'resize_event',
  'edit_occurrence',
  'edit_series',
  'split_series',
  'delete_event',
  'delete_occurrence',
  'delete_series',
  'create_reminder',
  'update_reminder',
  'delete_reminder',
])

const FIELD_IGNORES = new Set([
  'event_id',
  'calendar_id',
  'calendar_name',
  'occurrence_start',
])

export function toolLabel(name) {
  if (!name) return 'Calendar tool'
  return TOOL_LABELS[name] || name.replace(/_/g, ' ')
}

export function isWriteTool(name) {
  return WRITE_TOOLS.has(name)
}

/** Derives a compact status for a tool message from the backend result. */
export function toolStatus(message) {
  const result = message?.tool_result || {}
  if (result.error) {
    return { label: 'Failed', tone: 'error' }
  }
  if (result.status === 'pending_confirmation') {
    return { label: 'Awaiting approval', tone: 'pending' }
  }
  if (result.status === 'deleted') {
    return { label: 'Deleted', tone: 'success' }
  }
  if (result.status === 'cancelled') {
    return { label: 'Cancelled', tone: 'success' }
  }
  if (result.status === 'rejected') {
    return { label: 'Rejected', tone: 'muted' }
  }
  return { label: 'Done', tone: 'success' }
}

/**
 * The backend stores confirmation previews as a human-readable summary, e.g.
 * "Operation: Delete event | Event: Standup | When: … | Scope: single occurrence".
 * Splitting it keeps the confirmation cards structured without changing the
 * agent backend.
 */
export function parseActionSummary(summary) {
  const fields = {}
  if (typeof summary === 'string') {
    for (const part of summary.split(' | ')) {
      const index = part.indexOf(':')
      if (index > 0) {
        fields[part.slice(0, index).trim().toLowerCase()] = part
          .slice(index + 1)
          .trim()
      }
    }
  }
  return {
    operation: fields.operation || '',
    event: fields.event || '',
    when: fields.when || '',
    timezone: fields.timezone || '',
    scope: fields.scope || '',
    occurrence: fields.occurrence || '',
    changes: fields.changes || '',
    recurring: fields['recurring series'] || '',
  }
}

export function changedFields(argumentsObject) {
  if (!argumentsObject || typeof argumentsObject !== 'object') {
    return ''
  }
  return Object.keys(argumentsObject)
    .filter((key) => !FIELD_IGNORES.has(key))
    .map((key) => key.replace(/_/g, ' '))
    .join(', ')
}

export function actionConsequence(toolName) {
  switch (toolName) {
    case 'delete_event':
      return 'This permanently deletes the event from your calendar.'
    case 'delete_occurrence':
      return 'Only this occurrence is cancelled. The rest of the repeating series stays.'
    case 'delete_series':
      return 'This deletes the entire repeating series and every occurrence in it.'
    case 'edit_series':
      return 'This applies the change to every occurrence in the repeating series.'
    case 'split_series':
      return 'Earlier occurrences keep the current settings; this and following occurrences move to a new series.'
    case 'edit_occurrence':
      return 'Only this occurrence changes. The rest of the series stays as it is.'
    case 'move_event':
    case 'resize_event':
    case 'update_event':
      return 'This changes the event on your calendar.'
    case 'create_event':
    case 'create_recurring_event':
      return 'This adds a new event to your calendar.'
    case 'delete_reminder':
      return 'This removes the reminder from the event.'
    default:
      return 'Review the details before approving.'
  }
}

export function formatDateTime(value) {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatConversationTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  if (sameDay) {
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    })
  }
  const options =
    date.getFullYear() === now.getFullYear()
      ? { month: 'short', day: 'numeric' }
      : { year: 'numeric', month: 'short', day: 'numeric' }
  return date.toLocaleDateString(undefined, options)
}
