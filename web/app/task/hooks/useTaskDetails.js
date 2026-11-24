import { useCallback, useEffect, useRef, useState } from 'react'
import {
  attachLabel,
  createComment,
  deleteComment,
  detachLabel,
  getTask,
  listActivities,
  listComments,
  listLabels,
  removeAssignment,
} from '../api.js'

export default function useTaskDetails({ taskId, onUnauthorized, refreshKey = 0 }) {
  const unauthorizedRef = useRef(onUnauthorized)
  useEffect(() => {
    unauthorizedRef.current = onUnauthorized
  }, [onUnauthorized])

  const [task, setTask] = useState(null)
  const [comments, setComments] = useState([])
  const [activities, setActivities] = useState([])
  const [availableLabels, setAvailableLabels] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [commentsError, setCommentsError] = useState('')
  const [activitiesError, setActivitiesError] = useState('')
  const [labelsError, setLabelsError] = useState('')
  const [actionError, setActionError] = useState('')
  const [commentsBusy, setCommentsBusy] = useState(false)
  const [labelsBusy, setLabelsBusy] = useState(false)
  const [assignmentsBusy, setAssignmentsBusy] = useState(false)

  const report = useCallback((err, setter) => {
    if (err?.status === 401) {
      unauthorizedRef.current?.()
      return true
    }
    setter(err?.message || 'Something went wrong. Please try again.')
    return false
  }, [])

  const load = useCallback(async () => {
    if (!taskId) return
    setLoading(true)
    setError('')
    setCommentsError('')
    setActivitiesError('')
    setLabelsError('')
    setActionError('')
    try {
      const [taskData, commentData, activityData, labelsData] = await Promise.all([
        getTask(taskId),
        listComments(taskId, { limit: 100 }).catch((err) => ({ __error: err })),
        listActivities(taskId, { limit: 100 }).catch((err) => ({ __error: err })),
        listLabels({ limit: 100 }).catch((err) => ({ __error: err })),
      ])
      setTask(taskData)
      if (commentData?.__error) {
        setComments([])
        if (commentData.__error.status !== 401) setCommentsError(commentData.__error.message || 'Could not load comments.')
        else unauthorizedRef.current?.()
      } else {
        setComments(Array.isArray(commentData?.items) ? commentData.items : [])
      }
      if (activityData?.__error) {
        setActivities([])
        if (activityData.__error.status !== 401) setActivitiesError(activityData.__error.message || 'Could not load activity history.')
        else unauthorizedRef.current?.()
      } else {
        setActivities(Array.isArray(activityData?.items) ? activityData.items : [])
      }
      if (labelsData?.__error) {
        setAvailableLabels([])
        if (labelsData.__error.status !== 401) setLabelsError(labelsData.__error.message || 'Could not load labels.')
        else unauthorizedRef.current?.()
      } else {
        setAvailableLabels(Array.isArray(labelsData?.items) ? labelsData.items : [])
      }
    } catch (err) {
      report(err, setError)
    } finally {
      setLoading(false)
    }
  }, [taskId, report])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  async function refreshTaskOnly() {
    if (!taskId) return
    try {
      const taskData = await getTask(taskId)
      setTask(taskData)
    } catch (err) {
      report(err, setActionError)
    }
  }

  const addComment = useCallback(async (content) => {
    if (!taskId) return false
    setCommentsBusy(true)
    setCommentsError('')
    try {
      const created = await createComment(taskId, content)
      setComments((prev) => [...prev, created])
      return true
    } catch (err) {
      report(err, setCommentsError)
      return false
    } finally {
      setCommentsBusy(false)
    }
  }, [taskId, report])

  const removeComment = useCallback(async (commentId) => {
    if (!taskId) return
    setCommentsBusy(true)
    setCommentsError('')
    try {
      await deleteComment(taskId, commentId)
      setComments((prev) => prev.filter((c) => c.id !== commentId))
    } catch (err) {
      report(err, setCommentsError)
    } finally {
      setCommentsBusy(false)
    }
  }, [taskId, report])

  const toggleLabel = useCallback(async (labelId, attached) => {
    if (!taskId) return
    setLabelsBusy(true)
    setLabelsError('')
    try {
      if (attached) await detachLabel(taskId, labelId)
      else await attachLabel(taskId, labelId)
      await refreshTaskOnly()
    } catch (err) {
      report(err, setLabelsError)
    } finally {
      setLabelsBusy(false)
    }
  }, [taskId, report])

  const removeAssignee = useCallback(async (userId) => {
    if (!taskId) return
    setAssignmentsBusy(true)
    setActionError('')
    try {
      await removeAssignment(taskId, userId)
      await refreshTaskOnly()
    } catch (err) {
      report(err, setActionError)
    } finally {
      setAssignmentsBusy(false)
    }
  }, [taskId, report])

  return {
    task,
    comments,
    activities,
    availableLabels,
    loading,
    error,
    commentsError,
    activitiesError,
    labelsError,
    actionError,
    commentsBusy,
    labelsBusy,
    assignmentsBusy,
    reload: load,
    refreshTaskOnly,
    addComment,
    removeComment,
    toggleLabel,
    removeAssignee,
  }
}
