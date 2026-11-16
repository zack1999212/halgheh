/**
 * Maps a FullCalendar event object into the shape the detail panel renders.
 * Extended properties follow the backend EventResponse field names so the
 * calendar integration can attach records without reshaping them.
 */
export function toEventDetail(event) {
  const props = event.extendedProps || {}

  return {
    id: event.id,
    title: event.title,
    description: props.description || '',
    location: props.location || '',
    isAllDay: Boolean(event.allDay),
    start: event.start,
    end: event.end,
    timezone: props.timezone || '',
    calendarId: props.calendarId ?? null,
    calendarName: props.calendarName || '',
    calendarColor: props.calendarColor || '',
    isRecurring: Boolean(props.isRecurring || props.recurrenceRule),
    recurrenceRule: props.recurrenceRule || '',
    reminders: Array.isArray(props.reminders) ? props.reminders : [],
  }
}

function formatTime(date, timeZone) {
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  })
}

function formatDay(date, timeZone) {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  })
}

/** Returns the last inclusive day of an all-day range (FullCalendar ends are exclusive). */
function inclusiveEndDate(end) {
  return new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1)
}

export function formatEventWhen(detail) {
  const { start, end, isAllDay, timeZone } = detail
  if (!start) {
    return ''
  }

  if (isAllDay) {
    if (!end) {
      return start.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    }
    const lastDay = inclusiveEndDate(end)
    if (lastDay.toDateString() === start.toDateString()) {
      return formatDay(start)
    }
    return `${start.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })} – ${lastDay.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })}`
  }

  // Timed events carry their own IANA zone; render the wall clock the user
  // entered there so the displayed time always matches the timezone label.
  if (!end) {
    return `${formatDay(start, timeZone)} · ${formatTime(start, timeZone)}`
  }

  const sameDay =
    formatDay(start, timeZone) === formatDay(end, timeZone)

  if (sameDay) {
    return `${formatDay(start, timeZone)} · ${formatTime(start, timeZone)} – ${formatTime(end, timeZone)}`
  }

  return `${formatDay(start, timeZone)} · ${formatTime(start, timeZone)} – ${formatDay(end, timeZone)} · ${formatTime(end, timeZone)}`
}

/** "15 minutes before", "1 hour before", "At start time". */
export function formatReminder(minutesBefore) {
  const minutes = Number(minutesBefore)
  if (!Number.isFinite(minutes) || minutes < 0) {
    return ''
  }
  if (minutes === 0) {
    return 'At start time'
  }
  if (minutes % 1440 === 0) {
    const days = minutes / 1440
    return `${days} ${days === 1 ? 'day' : 'days'} before`
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} before`
  }
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} before`
}
