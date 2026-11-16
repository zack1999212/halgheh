import { getBrowserTimeZone, wallToIso } from './time.js'

export const WEEKDAYS = [
  { code: 'MO', label: 'Mon' },
  { code: 'TU', label: 'Tue' },
  { code: 'WE', label: 'Wed' },
  { code: 'TH', label: 'Thu' },
  { code: 'FR', label: 'Fri' },
  { code: 'SA', label: 'Sat' },
  { code: 'SU', label: 'Sun' },
]

export const FREQUENCY_OPTIONS = [
  { value: '', label: 'Does not repeat' },
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'YEARLY', label: 'Yearly' },
]

const FREQUENCY_LABELS = {
  DAILY: 'day',
  WEEKLY: 'week',
  MONTHLY: 'month',
  YEARLY: 'year',
}

function parseParams(rule) {
  const params = {}
  for (const part of String(rule || '').split(';')) {
    const [key, value] = part.split('=')
    if (key && value) {
      params[key.trim().toUpperCase()] = value.trim()
    }
  }
  return params
}

/**
 * Parses the backend's RRULE string into the form state used by the dialog.
 * Anything unsupported by the form is left out; the saved rule is rebuilt from
 * the form, so editing a rule the UI cannot express requires re-entering it.
 */
export function parseRecurrenceRule(rule) {
  if (!rule) {
    return {
      frequency: '',
      interval: 1,
      byDay: [],
      endMode: 'never',
      untilDate: '',
      count: '',
    }
  }
  const params = parseParams(rule)
  let endMode = 'never'
  let untilDate = ''
  let count = ''

  if (params.COUNT) {
    endMode = 'count'
    count = params.COUNT
  } else if (params.UNTIL) {
    endMode = 'until'
    const until = params.UNTIL
    if (/^\d{8}T/.test(until)) {
      untilDate = `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}`
    } else if (/^\d{8}$/.test(until)) {
      untilDate = `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}`
    }
  }

  return {
    frequency: params.FREQ || '',
    interval: Number(params.INTERVAL) > 0 ? Number(params.INTERVAL) : 1,
    byDay: params.BYDAY
      ? params.BYDAY.split(',')
          .map((code) => code.replace(/[^A-Z]/g, '').slice(-2))
          .filter(Boolean)
      : [],
    endMode,
    untilDate,
    count,
  }
}

/**
 * Builds an RFC 5545 RRULE for the backend. Timed rules use an aware UTC
 * UNTIL (end of the selected local day); all-day rules use a DATE UNTIL.
 */
export function buildRecurrenceRule({
  frequency,
  interval,
  byDay,
  endMode,
  untilDate,
  count,
  isAllDay,
  timeZone = getBrowserTimeZone(),
}) {
  if (!frequency) {
    return null
  }

  const parts = [`FREQ=${frequency}`]
  const step = Number(interval)
  if (Number.isFinite(step) && step > 1) {
    parts.push(`INTERVAL=${Math.floor(step)}`)
  }
  if (frequency === 'WEEKLY' && byDay.length > 0) {
    parts.push(`BYDAY=${byDay.join(',')}`)
  }
  if (endMode === 'count' && Number(count) > 0) {
    parts.push(`COUNT=${Math.floor(Number(count))}`)
  }
  if (endMode === 'until' && untilDate) {
    if (isAllDay) {
      parts.push(`UNTIL=${untilDate.replace(/-/g, '')}`)
    } else {
      // The local end of the chosen day, converted to a UTC instant — a naive
      // date-only UNTIL or a hardcoded T235959Z would leak an extra day in
      // positive-offset timezones (e.g. America/New_York).
      const endOfDay = wallToIso(`${untilDate}T23:59`, timeZone)
      const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(endOfDay)
      if (match) {
        parts.push(
          `UNTIL=${match[1]}${match[2]}${match[3]}T${match[4]}${match[5]}00Z`,
        )
      }
    }
  }
  return parts.join(';')
}

/** Human readable summary; falls back to the raw rule when unknown. */
export function describeRecurrence(rule) {
  if (!rule) {
    return ''
  }
  const params = parseParams(rule)
  const frequency = params.FREQ
  if (!frequency) {
    return rule
  }

  const interval = Number(params.INTERVAL) || 1
  const unit = FREQUENCY_LABELS[frequency] || 'period'
  let text

  if (frequency === 'WEEKLY' && params.BYDAY) {
    const days = params.BYDAY.split(',')
      .map((code) => WEEKDAYS.find((day) => day.code === code.slice(-2))?.label)
      .filter(Boolean)
    text = `Weekly on ${days.join(', ') || 'the same day'}`
  } else {
    text =
      interval === 1
        ? `Every ${unit}`
        : `Every ${interval} ${unit}s`
  }

  if (frequency !== 'WEEKLY' && interval > 1) {
    text = `Every ${interval} ${unit}s`
  } else if (frequency !== 'WEEKLY' && interval === 1) {
    text = `Every ${unit}`
  }

  if (params.COUNT) {
    text += ` · ${params.COUNT} times`
  } else if (params.UNTIL) {
    const until = params.UNTIL
    const date = /^\d{8}/.test(until)
      ? `${until.slice(6, 8)}/${until.slice(4, 6)}/${until.slice(0, 4)}`
      : until
    text += ` · until ${date}`
  }

  return text
}
