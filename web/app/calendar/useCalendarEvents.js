import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listAccessibleOccurrences, listOccurrences, listProjectOccurrences } from './api.js'

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
    workspaces: Array.isArray(occurrence.workspaces) ? occurrence.workspaces : [],
  }
}

/**
 * Maps an OccurrenceResponse onto a FullCalendar event.
 *
 * Recurring occurrences keep the backend's original occurrence identifier so
 * edits and cancellations can be sent back with the exact identifier the
 * backend expects (a timestamp for timed events, a date for all-day events).
 */
export function occurrenceToCalendarEvent(occurrence, calendar) {
  // Use the occurrence's own start time/date for a unique ID per occurrence.
  const occurrenceKey = occurrence.is_all_day
    ? occurrence.start_date
    : occurrence.start_at

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
    return {
      id,
      title: occurrence.title,
      allDay: true,
      start: occurrence.start_date || '',
      end: occurrence.end_date || '',
      extendedProps,
    }
  }

  return {
    id,
    title: occurrence.title,
    allDay: false,
    start: occurrence.start_at || '',
    end: occurrence.end_at || '',
    extendedProps,
  }
}

function calendarLookup(calendars) {
  const map = new Map()
  if (Array.isArray(calendars)) {
    for (const c of calendars) {
      if (c?.id != null) map.set(c.id, c)
    }
  }
  return map
}

/**
 * Loads occurrences for the visible range. Newer requests abort older ones so
 * a slow response can never overwrite fresher data.
 *
 * Modes:
 * - calendarId: list occurrences for a specific calendar (default)
 * - projectId: list project occurrences
 * - workspaceScope: 'all' or a workspace id - uses global accessible occurrences endpoint
 */
export default function useCalendarEvents({
  calendarId,
  projectId,
  calendar,
  calendars,
  workspaceScope,
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

  const useAccessible = workspaceScope != null
  const workspaceId = workspaceScope === 'all' ? undefined : workspaceScope

  const load = useCallback(
    async (range) => {
      const sourceId = projectId ?? calendarId
      if (!useAccessible && !sourceId) {
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
        let data
        if (useAccessible) {
          data = await listAccessibleOccurrences({
            ...range,
            workspaceId,
            signal: controller.signal,
          })
        } else if (projectId) {
          data = await listProjectOccurrences(projectId, {
            ...range,
            signal: controller.signal,
          })
        } else {
          data = await listOccurrences(calendarId, {
            ...range,
            signal: controller.signal,
          })
        }
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
    [calendarId, projectId, useAccessible, workspaceId],
  )

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

  useEffect(() => {
    if (rangeRef.current) {
      load(rangeRef.current)
    }
  }, [load])

  // Switching scope/calendars/projects must not leave stale events on screen.
  useEffect(() => {
    setOccurrences([])
    setError('')
  }, [calendarId, projectId, useAccessible, workspaceId])

  useEffect(() => () => abortRef.current?.abort(), [])

  const calendarById = useMemo(() => calendarLookup(calendars), [calendars])

  const events = useMemo(
    () =>
      occurrences.map((occurrence) => {
        const occCalendar =
          calendarById.get(occurrence.calendar_id) ||
          calendar ||
          (occurrence.calendar_id != null
            ? { id: occurrence.calendar_id, name: `Calendar #${occurrence.calendar_id}`, color: null }
            : null)
        return occurrenceToCalendarEvent(occurrence, occCalendar)
      }),
    [occurrences, calendar, calendarById],
  )

  return { events, occurrences, loading, error, setRange, reload }
}
