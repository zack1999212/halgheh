import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createCalendar,
  deleteCalendar,
  listCalendars,
  updateCalendar,
} from './api.js'

/** Loads the authenticated user's calendars and keeps the selection valid. */
export default function useCalendars({ onUnauthorized } = {}) {
  const unauthorizedRef = useRef(onUnauthorized)
  useEffect(() => {
    unauthorizedRef.current = onUnauthorized
  }, [onUnauthorized])

  const [calendars, setCalendars] = useState([])
  const [selectedCalendarId, setSelectedCalendarId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const report = useCallback((err, setter) => {
    if (err?.status === 401) {
      unauthorizedRef.current?.()
      return
    }
    setter(err?.message || 'Something went wrong. Please try again.')
  }, [])

  const reload = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) {
        setLoading(true)
      }
      setError('')
      try {
        const data = await listCalendars()
        setCalendars(Array.isArray(data) ? data : [])
      } catch (err) {
        report(err, setError)
      } finally {
        if (!silent) {
          setLoading(false)
        }
      }
    },
    [report],
  )

  useEffect(() => {
    reload()
  }, [reload])

  // Keep the selection pointing at a calendar that still exists. The backend
  // creates a default calendar per user, so prefer that when nothing is chosen.
  useEffect(() => {
    if (calendars.length === 0) {
      if (selectedCalendarId !== null) {
        setSelectedCalendarId(null)
      }
      return
    }
    if (
      selectedCalendarId != null &&
      calendars.some((calendar) => calendar.id === selectedCalendarId)
    ) {
      return
    }
    const preferred =
      calendars.find((calendar) => calendar.is_default) || calendars[0]
    setSelectedCalendarId(preferred.id)
  }, [calendars, selectedCalendarId])

  const create = useCallback(
    async (payload) => {
      setSaving(true)
      try {
        const created = await createCalendar(payload)
        await reload({ silent: true })
        setSelectedCalendarId(created.id)
        return created
      } finally {
        setSaving(false)
      }
    },
    [reload],
  )

  const update = useCallback(
    async (calendarId, updates) => {
      setSaving(true)
      try {
        const updated = await updateCalendar(calendarId, updates)
        await reload({ silent: true })
        return updated
      } finally {
        setSaving(false)
      }
    },
    [reload],
  )

  const remove = useCallback(
    async (calendarId) => {
      setSaving(true)
      try {
        await deleteCalendar(calendarId)
        await reload({ silent: true })
      } finally {
        setSaving(false)
      }
    },
    [reload],
  )

  const selectedCalendar =
    calendars.find((calendar) => calendar.id === selectedCalendarId) || null

  return {
    calendars,
    selectedCalendarId,
    selectedCalendar,
    setSelectedCalendarId,
    loading,
    error,
    saving,
    reload,
    create,
    update,
    remove,
  }
}
