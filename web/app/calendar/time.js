/**
 * Timezone helpers.
 *
 * The backend stores timed events as timezone-aware instants plus an IANA
 * timezone, and all-day events as date-only values with an exclusive end date.
 * These helpers convert between those contracts and the wall-clock values used
 * by `datetime-local` / `date` inputs without ever producing naive timestamps.
 */

export function getBrowserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export function isValidTimeZone(value) {
  if (!value) {
    return false
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

const formatterCache = new Map()

function zoneFormatter(timeZone) {
  let formatter = formatterCache.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatterCache.set(timeZone, formatter)
  }
  return formatter
}

function zonedParts(date, timeZone) {
  const parts = {}
  for (const part of zoneFormatter(timeZone).formatToParts(date)) {
    if (part.type !== 'literal') {
      parts[part.type] = part.value
    }
  }
  const hour = parts.hour === '24' ? 0 : Number(parts.hour)
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute: Number(parts.minute),
    second: Number(parts.second),
  }
}

function zoneOffsetMs(date, timeZone) {
  const parts = zonedParts(date, timeZone)
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )
  return asUtc - Math.floor(date.getTime() / 1000) * 1000
}

/** "YYYY-MM-DDTHH:mm" wall time in `timeZone` -> ISO instant (UTC). */
export function wallToIso(wall, timeZone) {
  const [datePart, timePart = '00:00'] = String(wall).split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute] = timePart.split(':').map(Number)

  const utcGuess = Date.UTC(year, month - 1, day, hour, minute)
  // Two passes settle the offset even across DST boundaries.
  let timestamp = utcGuess - zoneOffsetMs(new Date(utcGuess), timeZone)
  timestamp = utcGuess - zoneOffsetMs(new Date(timestamp), timeZone)
  return new Date(timestamp).toISOString()
}

/** ISO instant -> "YYYY-MM-DDTHH:mm" in `timeZone` (for datetime-local). */
export function isoToWall(iso, timeZone) {
  if (!iso) {
    return ''
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const parts = zonedParts(date, timeZone)
  const pad = (value) => String(value).padStart(2, '0')
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`
}

/** ISO instant -> "YYYY-MM-DD" in `timeZone`. */
export function isoToDate(iso, timeZone) {
  const wall = isoToWall(iso, timeZone)
  return wall ? wall.slice(0, 10) : ''
}

export function addDays(dateString, days) {
  if (!dateString) {
    return ''
  }
  const [year, month, day] = dateString.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return date.toISOString().slice(0, 10)
}

/** Exclusive end date for a single-day all-day event. */
export function nextDay(dateString) {
  return addDays(dateString, 1)
}

export function isDateOnly(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

/** Parses "YYYY-MM-DD" into a local Date at midnight (no UTC shift). */
export function parseDateOnly(value) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}
