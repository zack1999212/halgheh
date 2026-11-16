import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createComment,
  createReminder,
  deleteComment,
  deleteReminder,
  getEvent,
  listComments,
  listReminders,
  updateReminder,
} from './api.js'

/**
 * Loads one event with its reminders and comments, and owns the reminder and
 * comment mutations so the panel only deals with presentation.
 */
export default function useEventDetails({
  calendarId,
  occurrence,
  refreshKey = 0,
  onUnauthorized,
}) {
  const unauthorizedRef = useRef(onUnauthorized)
  useEffect(() => {
    unauthorizedRef.current = onUnauthorized
  }, [onUnauthorized])

  const eventId = occurrence?.eventId ?? null

  const [event, setEvent] = useState(null)
  const [reminders, setReminders] = useState([])
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [remindersError, setRemindersError] = useState('')
  const [commentsError, setCommentsError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)
  const [commentsBusy, setCommentsBusy] = useState(false)

  const report = useCallback((err, setter) => {
    if (err?.status === 401) {
      unauthorizedRef.current?.()
      return
    }
    setter(err?.message || 'Something went wrong. Please try again.')
  }, [])

  const load = useCallback(async () => {
    if (!calendarId || !eventId) {
      return
    }
    setLoading(true)
    setError('')
    setRemindersError('')
    setCommentsError('')
    try {
      const [eventData, reminderList, commentList] = await Promise.all([
        getEvent(calendarId, eventId),
        listReminders(calendarId, eventId),
        listComments(calendarId, eventId),
      ])
      setEvent(eventData)
      setReminders(Array.isArray(reminderList) ? reminderList : [])
      setComments(Array.isArray(commentList) ? commentList : [])
    } catch (err) {
      report(err, setError)
    } finally {
      setLoading(false)
    }
  }, [calendarId, eventId, report])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  const runReminderAction = useCallback(
    async (action) => {
      setBusy(true)
      setActionError('')
      try {
        await action()
      } catch (err) {
        report(err, setRemindersError)
      } finally {
        setBusy(false)
      }
    },
    [report],
  )

  const addReminder = useCallback(
    async (minutesBefore) => {
      await runReminderAction(async () => {
        const created = await createReminder(
          calendarId,
          eventId,
          Number(minutesBefore),
        )
        setReminders((current) =>
          [...current, created].sort(
            (a, b) => a.minutes_before - b.minutes_before || a.id - b.id,
          ),
        )
      })
    },
    [calendarId, eventId, runReminderAction],
  )

  const changeReminder = useCallback(
    async (reminderId, minutesBefore) => {
      await runReminderAction(async () => {
        const updated = await updateReminder(
          calendarId,
          eventId,
          reminderId,
          Number(minutesBefore),
        )
        setReminders((current) =>
          current
            .map((reminder) =>
              reminder.id === updated.id ? updated : reminder,
            )
            .sort(
              (a, b) => a.minutes_before - b.minutes_before || a.id - b.id,
            ),
        )
      })
    },
    [calendarId, eventId, runReminderAction],
  )

  const removeReminder = useCallback(
    async (reminderId) => {
      await runReminderAction(async () => {
        await deleteReminder(calendarId, eventId, reminderId)
        setReminders((current) =>
          current.filter((reminder) => reminder.id !== reminderId),
        )
      })
    },
    [calendarId, eventId, runReminderAction],
  )

  const addComment = useCallback(
    async (content) => {
      setCommentsBusy(true)
      setActionError('')
      try {
        const created = await createComment(calendarId, eventId, content)
        setComments((current) => [...current, created])
        return true
      } catch (err) {
        report(err, setCommentsError)
        return false
      } finally {
        setCommentsBusy(false)
      }
    },
    [calendarId, eventId, report],
  )

  const removeComment = useCallback(
    async (commentId) => {
      setCommentsBusy(true)
      setActionError('')
      try {
        await deleteComment(calendarId, eventId, commentId)
        setComments((current) =>
          current.filter((comment) => comment.id !== commentId),
        )
      } catch (err) {
        report(err, setCommentsError)
      } finally {
        setCommentsBusy(false)
      }
    },
    [calendarId, eventId, report],
  )

  return {
    event,
    reminders,
    comments,
    loading,
    error,
    remindersError,
    commentsError,
    actionError,
    busy,
    commentsBusy,
    reload: load,
    addReminder,
    changeReminder,
    removeReminder,
    addComment,
    removeComment,
  }
}
