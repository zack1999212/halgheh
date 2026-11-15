const relativeFormatter = new Intl.RelativeTimeFormat(undefined, {
  numeric: 'auto',
})

const UNITS = [
  { limit: 60, divisor: 1, unit: 'second' },
  { limit: 3600, divisor: 60, unit: 'minute' },
  { limit: 86400, divisor: 3600, unit: 'hour' },
  { limit: 604800, divisor: 86400, unit: 'day' },
  { limit: 2629800, divisor: 604800, unit: 'week' },
  { limit: 31557600, divisor: 2629800, unit: 'month' },
  { limit: Infinity, divisor: 31557600, unit: 'year' },
]

/** "3 minutes ago", "yesterday" — used in the compact notification list. */
export function formatRelativeTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const seconds = (date.getTime() - Date.now()) / 1000
  const magnitude = Math.abs(seconds)
  const unit = UNITS.find((entry) => magnitude < entry.limit) || UNITS.at(-1)
  return relativeFormatter.format(
    Math.round(seconds / unit.divisor),
    unit.unit,
  )
}

export function formatDateTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

/**
 * Event context available on a notification: the API exposes
 * occurrence_start_at / occurrence_start_date but no event title.
 */
export function formatEventContext(notification) {
  if (notification.occurrence_start_at) {
    return formatDateTime(notification.occurrence_start_at)
  }
  if (notification.occurrence_start_date) {
    const date = new Date(`${notification.occurrence_start_date}T00:00:00`)
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString(undefined, { dateStyle: 'medium' })
    }
  }
  return ''
}

/** "calendar_reminder" -> "Calendar reminder". */
export function formatNotificationType(type) {
  if (!type) {
    return ''
  }
  const words = type.replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
