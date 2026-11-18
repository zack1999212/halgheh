import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listCalendars, listOccurrences } from '../../calendar/api.js'
import { occurrenceToSelection } from '../../calendar/useCalendarEvents.js'
import {
  addDays,
  getBrowserTimeZone,
  isoToDate,
  parseDateOnly,
  wallToIso,
} from '../../calendar/time.js'

function localDateString(date = new Date()) {
  const pad = (v) => String(v).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function occurrenceStartInstant(occ, timeZone) {
  if (!occ) return null
  if (occ.is_all_day) {
    // Treat all-day start at local midnight of its start date.
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
    // exclusive end
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
    const end = occ.end_date // exclusive
    if (!start || !end) return false
    return start <= dateStr && dateStr < end
  }
  const start = occurrenceStartInstant(occ, timeZone)
  if (start == null) return false
  const dayStart = new Date(wallToIso(`${dateStr}T00:00`, timeZone)).getTime()
  const dayEnd = new Date(wallToIso(`${addDays(dateStr, 1)}T00:00`, timeZone)).getTime()
  const end = occurrenceEndInstant(occ, timeZone) ?? start
  // Overlaps the local day.
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
 * Fetches calendar occurrences needed for workspace dashboard:
 * - today's schedule/count (local day)
 * - upcoming 7 local calendar days window
 *
 * Uses backend occurrence expansion per calendar; recurrence is not computed client-side.
 */
export default function useWorkspaceCalendarData({ onUnauthorized } = {}) {
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
    setLoading(true)
    setError('')
    try {
      const cals = await listCalendars()
      const calendarsList = Array.isArray(cals) ? cals : []
      if (requestId !== requestRef.current) return
      setCalendars(calendarsList)

      if (calendarsList.length === 0) {
        setItems([])
        return
      }

      const windowStart = wallToIso(`${todayStr}T00:00`, timeZone)
      const windowEnd = wallToIso(`${addDays(todayStr, 8)}T00:00`, timeZone)

      const results = await Promise.all(
        calendarsList.map(async (calendar) => {
          try {
            const occs = await listOccurrences(calendar.id, {
              start: windowStart,
              end: windowEnd,
              timezone: timeZone,
            })
            return (Array.isArray(occs) ? occs : []).map((o) => decorate(o, calendar))
          } catch (err) {
            if (err?.status === 401) throw err
            // Per-calendar failure: skip this calendar but keep others.
            return { __calendarError: err, calendarId: calendar.id }
          }
        })
      )

      if (requestId !== requestRef.current) return

      const flat = []
      let hadCalendarError = false
      for (const part of results) {
        if (part && part.__calendarError) {
          hadCalendarError = true
          continue
        }
        if (Array.isArray(part)) flat.push(...part)
      }

      // Deduplicate by event+occurrence identity in case of overlaps.
      const seen = new Set()
      const deduped = []
      for (const item of flat) {
        const occ = item.occurrence || {}
        const key = `${occ.event_id}|${occ.original_start_at || ''}|${occ.original_start_date || ''}|${occ.start_at || ''}|${occ.start_date || ''}`
        if (seen.has(key)) continue
        seen.add(key)
        deduped.push(item)
      }

      setItems(deduped)
      if (hadCalendarError && deduped.length === 0) {
        setError('Could not load some calendar events.')
      }
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
  }, [timeZone, todayStr])

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

    // Upcoming: next 7 local calendar days after today, excluding today's
    // schedule to avoid duplication. Sorted chronologically.
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
      // "next upcoming event time" today: prefer events not yet ended.
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
