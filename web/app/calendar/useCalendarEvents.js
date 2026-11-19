import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listOccurrences, listProjectOccurrences } from './api.js'

/**
 * Maps a backend occurrence onto the camelCase descriptor used by the detail
 * panel and the event dialog. Occurrence identity keeps the backend field
 * names' meaning: original_start_at for timed, original_start_date for all-day.
 */
export function occurrenceToSelection(occurrence) {
  if (!occurrence) {
    return null
  }
  return {
    eventId: occurrence.event_id,
    calendarId: occurrence.calendar_id ?? null,
    title: occurrence.title,
    description: occurrence.description,
    isAllDay: Boolean(occurrence.is_all_day),
    startAt: occurrence.start_at,
    endAt: occurrence.end_at,
    startDate: occurrence.start_date,
    endDate: occurrence.end_date,
    timezone: occurrence.timezone || '',
    originalStartAt: occurrence.original_start_at || null,
    originalStartDate: occurrence.original_start_date || null,
    isRecurring: Boolean(occurrence.is_recurring),
    isException: Boolean(occurrence.is_exception),
    category: occurrence.category || 'other',
  }
}

/**
 * Maps an OccurrenceResponse onto a FullCalendar event.
 *
 * Recurring occurrences keep the backend's original occurrence identifier so
 * edits and cancellations can be sent back with the exact identifier the
 * backend expects (a timestamp for timed events, a date for all-day events).
 *
 * **Important**: For recurring events, the FullCalendar `id` must be unique per
 * occurrence (not based on `original_start_at`/`original_start_date` which are
 * the same for all occurrences). The backend `event_id` is preserved in
 * `extendedProps.eventId` for editing/cancellation logic.
 */
export function occurrenceToCalendarEvent(occurrence, calendar) {
  const originalKey = occurrence.original_start_at ?? occurrence.original_start_date
  
  // Use the occurrence's own start time/date for a unique ID per occurrence.
  // original_start_at/date are the same for all occurrences in a series,
  // FullCalendar to deduplicate them into one event.
  const occurrenceKey = occurrence.is_all_day
    ? occurrence.start_date
    : occurrence.start_at
  
  // Ensure a unique ID per occurrence by using event_id with a differentiator
  const id = occurrence.is_recurring
    ? `${occurrence.event_id}:${occurrenceKey || occurrence.event_id}`
    : String(occurrence.event_id)

  const resolvedCalendarId = occurrence.calendar_id ?? calendar?.id ?? null
  const extendedProps = {
    raw: occurrence,
    eventId: occurrence.event_id,
    isRecurring: Boolean(occurrence.is_recurring),
    isException: Boolean(occurrence.is_exception),
    originalStartAt: occurrence.original_start_at,
    originalStartDate: occurrence.original_start_date,
    description: occurrence.description || '',
    timezone: occurrence.timezone || '',
    calendarId: resolvedCalendarId,
    calendarName: calendar?.name || '',
    calendarColor: calendar?.color || '',
    category: occurrence.category || 'other',
  }

  if (occurrence.is_all_day) {
    // Backend dates are date-only with an exclusive end, exactly like
    // FullCalendar's all-day representation: pass them through untouched.
    return {
      id,
      title: occurrence.title,
      allDay: true,
      start: occurrence.start_date || '',
      end: occurrence.end_date || '',
      extendedProps,
    }
  }

  // For timed events, ensure start/end are always present
  return {
    id,
    title: occurrence.title,
    allDay: false,
    start: occurrence.start_at || '',
    end: occurrence.end_at || '',
    extendedProps,
  }
}

/**
 * Loads occurrences for the visible range. Newer requests abort older ones so
 * a slow response can never overwrite fresher data.
 */
export default function useCalendarEvents({
  calendarId,
  projectId,
  calendar,
  onUnauthorized,
}) {
  const unauthorizedRef = useRef(onUnauthorized)
  useEffect(() => {
    unauthorizedRef.current = onUnauthorized
  }, [onUnauthorized])

  const [occurrences, setOccurrences] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const rangeRef = useRef(null)
  const requestRef = useRef(0)
  const abortRef = useRef(null)

  const load = useCallback(
    async (range) => {
      const sourceId = projectId ?? calendarId
      if (!sourceId) {
        requestRef.current += 1
        abortRef.current?.abort()
        setOccurrences([])
        setLoading(false)
        setError('')
        return
      }

      const requestId = ++requestRef.current
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setLoading(true)
      setError('')
      try {
        const data = projectId
          ? await listProjectOccurrences(projectId, {
              ...range,
              signal: controller.signal,
            })
          : await listOccurrences(calendarId, {
              ...range,
              signal: controller.signal,
            })
        if (requestId !== requestRef.current) {
          return
        }
        setOccurrences(Array.isArray(data) ? data : [])
      } catch (err) {
        if (err?.name === 'AbortError' || requestId !== requestRef.current) {
          return
        }
        if (err?.status === 401) {
          unauthorizedRef.current?.()
          return
        }
        setError(err?.message || 'Could not load events.')
      } finally {
        if (requestId === requestRef.current) {
          setLoading(false)
        }
      }
    },
    [calendarId, projectId],
  )

  /** Called from FullCalendar's datesSet; skips identical ranges. */
  const setRange = useCallback(
    (range) => {
      const current = rangeRef.current
      if (
        current &&
        current.start === range.start &&
        current.end === range.end &&
        current.timezone === range.timezone
      ) {
        return
      }
      rangeRef.current = range
      load(range)
    },
    [load],
  )

  const reload = useCallback(() => {
    if (rangeRef.current) {
      load(rangeRef.current)
    }
  }, [load])

  // Reload when the selected calendar changes (load's identity changes).
  useEffect(() => {
    if (rangeRef.current) {
      load(rangeRef.current)
    }
  }, [load])

  // Switching calendars/projects must not leave another scope's events on screen.
  useEffect(() => {
    setOccurrences([])
    setError('')
  }, [calendarId, projectId])

  useEffect(() => () => abortRef.current?.abort(), [])

  const events = useMemo(
    () => occurrences.map((occurrence) => occurrenceToCalendarEvent(occurrence, calendar)),
    [occurrences, calendar],
  )

  return { events, occurrences, loading, error, setRange, reload }
}
