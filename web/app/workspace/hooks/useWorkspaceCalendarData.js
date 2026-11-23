import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listAccessibleOccurrences, listCalendars } from '../../calendar/api.js'
import { occurrenceToSelection } from '../../calendar/useCalendarEvents.js'
import {
  addDays,
  getBrowserTimeZone,
  wallToIso,
} from '../../calendar/time.js'
import { ALL_WORKSPACES } from '../constants.js'

function localDateString(date = new Date()) {
  const pad = (v) => String(v).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function occurrenceStartInstant(occ, timeZone) {
  if (!occ) return null
  if (occ.is_all_day) {
    const d = occ.start_date
    if (!d) return null
    return new Date(wallToIso(`${d}T00:00`, timeZone)).getTime()
  }
  if (!occ.start_at) return null
  const t = new Date(occ.start_at).getTime()
  return Number.isFinite(t) ? t : null
}

function occurrenceEndInstant(occ, timeZone) {
  if (!occ) return null
  if (occ.is_all_day) {
    const d = occ.end_date || occ.start_date
    if (!d) return null
    return new Date(wallToIso(`${d}T00:00`, timeZone)).getTime()
  }
  if (!occ.end_at) return occurrenceStartInstant(occ, timeZone)
  const t = new Date(occ.end_at).getTime()
  return Number.isFinite(t) ? t : occurrenceStartInstant(occ, timeZone)
}

function occursOnLocalDate(occ, dateStr, timeZone) {
  if (!occ) return false
  if (occ.is_all_day) {
    const start = occ.start_date
    const end = occ.end_date
    if (!start || !end) return false
    return start <= dateStr && dateStr < end
  }
  const start = occurrenceStartInstant(occ, timeZone)
  if (start == null) return false
  const dayStart = new Date(wallToIso(`${dateStr}T00:00`, timeZone)).getTime()
  const dayEnd = new Date(wallToIso(`${addDays(dateStr, 1)}T00:00`, timeZone)).getTime()
  const end = occurrenceEndInstant(occ, timeZone) ?? start
  return start < dayEnd && end > dayStart
}

function compareOccurrences(a, b, timeZone) {
  const sa = occurrenceStartInstant(a.occurrence, timeZone) ?? 0
  const sb = occurrenceStartInstant(b.occurrence, timeZone) ?? 0
  if (sa !== sb) return sa - sb
  const ea = occurrenceEndInstant(a.occurrence, timeZone) ?? sa
  const eb = occurrenceEndInstant(b.occurrence, timeZone) ?? sb
  if (ea !== eb) return ea - eb
  return String(a.occurrence?.title || '').localeCompare(String(b.occurrence?.title || ''))
}

function decorate(occurrence, calendar) {
  return {
    occurrence,
    calendar,
    selection: occurrenceToSelection(occurrence),
  }
}

/**
 * Workspace dashboard calendar data scoped to the selected workspace.
 */
export default function useWorkspaceCalendarData({ onUnauthorized, workspaceId } = {}) {
  const [calendars, setCalendars] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const requestRef = useRef(0)
  const unauthorizedRef = useRef(onUnauthorized)

  useEffect(() => {
    unauthorizedRef.current = onUnauthorized
  }, [onUnauthorized])

  const timeZone = useMemo(() => getBrowserTimeZone(), [])
  const todayStr = localDateString(new Date())

  const load = useCallback(async () => {
    const requestId = ++requestRef.current

    if (workspaceId == null) {
      setCalendars([])
      setItems([])
      setError('')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    setItems([])
    try {
      const windowStart = wallToIso(`${todayStr}T00:00`, timeZone)
      const windowEnd = wallToIso(`${addDays(todayStr, 8)}T00:00`, timeZone)

      const [calResult, occResult] = await Promise.allSettled([
        listCalendars(),
        listAccessibleOccurrences({
          start: windowStart,
          end: windowEnd,
          timezone: timeZone,
          workspaceId: workspaceId === ALL_WORKSPACES ? undefined : workspaceId,
        }),
      ])

      if (requestId !== requestRef.current) return

      if (calResult.status === 'rejected' && calResult.reason?.status === 401) {
        unauthorizedRef.current?.()
        return
      }
      if (occResult.status === 'rejected' && occResult.reason?.status === 401) {
        unauthorizedRef.current?.()
        return
      }

      const calendarsList =
        calResult.status === 'fulfilled' && Array.isArray(calResult.value)
          ? calResult.value
          : []
      setCalendars(calendarsList)
      const calendarById = new Map(calendarsList.map((c) => [c.id, c]))

      if (occResult.status === 'rejected') {
        setItems([])
        setError(occResult.reason?.message || 'Could not load calendar events.')
        return
      }

      const occs = Array.isArray(occResult.value) ? occResult.value : []
      const seen = new Set()
      const deduped = []
      for (const occ of occs) {
        const key = `${occ.event_id}|${occ.original_start_at || ''}|${occ.original_start_date || ''}|${occ.start_at || ''}|${occ.start_date || ''}`
        if (seen.has(key)) continue
        seen.add(key)
        const calendar = calendarById.get(occ.calendar_id) || {
          id: occ.calendar_id,
          name: occ.calendar_id ? `Calendar #${occ.calendar_id}` : 'Calendar',
          color: null,
        }
        deduped.push(decorate(occ, calendar))
      }

      setItems(deduped)
    } catch (err) {
      if (requestId !== requestRef.current) return
      if (err?.status === 401) {
        unauthorizedRef.current?.()
        return
      }
      setError(err?.message || 'Could not load calendar events.')
      setItems([])
      setCalendars([])
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false)
      }
    }
  }, [timeZone, todayStr, workspaceId])

  useEffect(() => {
    load()
  }, [load])

  const derived = useMemo(() => {
    const now = Date.now()
    const todayItems = items
      .filter((item) => occursOnLocalDate(item.occurrence, todayStr, timeZone))
      .sort((a, b) => compareOccurrences(a, b, timeZone))

    const tomorrowStr = addDays(todayStr, 1)
    const upcomingWindowStart = new Date(wallToIso(`${tomorrowStr}T00:00`, timeZone)).getTime()
    const upcomingWindowEnd = new Date(wallToIso(`${addDays(todayStr, 8)}T00:00`, timeZone)).getTime()

    const upcomingItems = items
      .filter((item) => {
        if (occursOnLocalDate(item.occurrence, todayStr, timeZone)) return false
        const start = occurrenceStartInstant(item.occurrence, timeZone)
        if (start == null) return false
        return start >= upcomingWindowStart && start < upcomingWindowEnd
      })
      .sort((a, b) => compareOccurrences(a, b, timeZone))

    const nextToday = todayItems.find((item) => {
      const start = occurrenceStartInstant(item.occurrence, timeZone)
      const end = occurrenceEndInstant(item.occurrence, timeZone) ?? start
      return end == null || end >= now
    }) || todayItems[0] || null

    return {
      timeZone,
      todayStr,
      todayItems,
      todayCount: todayItems.length,
      nextTodayEvent: nextToday,
      upcomingItems,
      upcomingCount: upcomingItems.length,
      nearestUpcoming: upcomingItems[0] || null,
    }
  }, [items, timeZone, todayStr])

  return {
    calendars,
    loading,
    error,
    reload: load,
    ...derived,
  }
}
