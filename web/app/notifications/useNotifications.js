import { useCallback, useEffect, useRef, useState } from 'react'
import {
  deleteAllNotifications,
  deleteNotification,
  getNotificationPreferences,
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
  updateNotificationPreferences,
} from './api.js'

const PAGE_LIMIT = 50

/**
 * Owns notification data for the shared header: the list, the authoritative
 * unread count and the calendar reminder preference. Loading happens once when
 * the shell mounts, on demand when the panel opens, and after every action —
 * no polling.
 */
export default function useNotifications({ onUnauthorized } = {}) {
  const unauthorizedRef = useRef(onUnauthorized)
  useEffect(() => {
    unauthorizedRef.current = onUnauthorized
  }, [onUnauthorized])

  const [items, setItems] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [bulkBusy, setBulkBusy] = useState(false)

  const [preferences, setPreferences] = useState(null)
  const [preferencesLoading, setPreferencesLoading] = useState(false)
  const [preferencesError, setPreferencesError] = useState('')
  const [savingPreference, setSavingPreference] = useState(false)
  const preferencesLoadedRef = useRef(false)

  const reportError = useCallback((err, setter) => {
    if (err?.status === 401) {
      unauthorizedRef.current?.()
      return
    }
    setter(err?.message || 'Something went wrong. Please try again.')
  }, [])

  const refresh = useCallback(
    async ({ showLoading = false } = {}) => {
      if (showLoading) {
        setLoading(true)
      }
      setError('')
      try {
        const [list, count] = await Promise.all([
          listNotifications({ limit: PAGE_LIMIT }),
          getUnreadCount(),
        ])
        setItems(Array.isArray(list) ? list : [])
        setUnreadCount(count)
      } catch (err) {
        reportError(err, setError)
      } finally {
        if (showLoading) {
          setLoading(false)
        }
      }
    },
    [reportError],
  )

  useEffect(() => {
    refresh({ showLoading: true })
  }, [refresh])

  // Lightweight polling for real-time badge/list updates without page refresh.
  useEffect(() => {
    let active = true
    const tick = async () => {
      if (!active) return
      if (document.visibilityState === 'hidden') return
      try {
        const count = await getUnreadCount()
        if (!active) return
        setUnreadCount((prev) => {
          if (prev !== count) {
            // Count changed; refresh list to keep panel consistent.
            refresh().catch(() => {})
          }
          return count
        })
      } catch (err) {
        if (active) reportError(err, setError)
      }
    }
    const id = setInterval(tick, 20000)
    const onVis = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      active = false
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [refresh, reportError])

  const syncUnreadCount = useCallback(async () => {
    try {
      setUnreadCount(await getUnreadCount())
    } catch (err) {
      reportError(err, setError)
    }
  }, [reportError])

  const toggleRead = useCallback(
    async (notification) => {
      setBusyId(notification.id)
      try {
        const updated = notification.is_read
          ? await markNotificationUnread(notification.id)
          : await markNotificationRead(notification.id)
        setItems((current) =>
          current.map((item) => (item.id === updated.id ? updated : item)),
        )
        await syncUnreadCount()
        return { ok: true, updated }
      } catch (err) {
        reportError(err, setError)
        return { ok: false, err }
      } finally {
        setBusyId(null)
      }
    },
    [reportError, syncUnreadCount],
  )

  const removeOne = useCallback(
    async (notificationId) => {
      setBusyId(notificationId)
      try {
        await deleteNotification(notificationId)
        setItems((current) =>
          current.filter((item) => item.id !== notificationId),
        )
        await syncUnreadCount()
        return { ok: true }
      } catch (err) {
        reportError(err, setError)
        return { ok: false, err }
      } finally {
        setBusyId(null)
      }
    },
    [reportError, syncUnreadCount],
  )

  const markAllRead = useCallback(async () => {
    setBulkBusy(true)
    try {
      await markAllNotificationsRead()
      await refresh()
      return { ok: true }
    } catch (err) {
      reportError(err, setError)
      return { ok: false, err }
    } finally {
      setBulkBusy(false)
    }
  }, [refresh, reportError])

  const removeAll = useCallback(async () => {
    setBulkBusy(true)
    try {
      await deleteAllNotifications()
      setItems([])
      setUnreadCount(0)
      return { ok: true }
    } catch (err) {
      reportError(err, setError)
      return { ok: false, err }
    } finally {
      setBulkBusy(false)
    }
  }, [reportError])

  const loadPreferences = useCallback(
    async ({ force = false } = {}) => {
      if (!force && preferencesLoadedRef.current) {
        return
      }
      setPreferencesLoading(true)
      setPreferencesError('')
      try {
        setPreferences(await getNotificationPreferences())
        preferencesLoadedRef.current = true
      } catch (err) {
        reportError(err, setPreferencesError)
      } finally {
        setPreferencesLoading(false)
      }
    },
    [reportError],
  )

  const setCalendarReminders = useCallback(
    async (enabled) => {
      const previous = preferences
      setSavingPreference(true)
      setPreferencesError('')
      setPreferences((current) =>
        current ? { ...current, calendar_reminders_enabled: enabled } : current,
      )
      try {
        const updated = await updateNotificationPreferences({
          calendar_reminders_enabled: enabled,
        })
        setPreferences(updated)
      } catch (err) {
        setPreferences(previous)
        reportError(err, setPreferencesError)
      } finally {
        setSavingPreference(false)
      }
    },
    [preferences, reportError],
  )

  return {
    items,
    unreadCount,
    loading,
    error,
    busyId,
    bulkBusy,
    refresh,
    toggleRead,
    removeOne,
    markAllRead,
    removeAll,
    preferences,
    preferencesLoading,
    preferencesError,
    savingPreference,
    loadPreferences,
    setCalendarReminders,
  }
}
