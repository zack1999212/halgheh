import { useCallback, useRef, useState } from 'react'
import { updateTaskStatus } from '../api.js'

export default function useTaskMutations({ onUnauthorized, onError, onSettled }) {
  const unauthorizedRef = useRef(onUnauthorized)
  const errorRef = useRef(onError)
  const settledRef = useRef(onSettled)
  unauthorizedRef.current = onUnauthorized
  errorRef.current = onError
  settledRef.current = onSettled

  const [pendingStatusIds, setPendingStatusIds] = useState(new Set())
  const inflight = useRef(new Set())

  const report = useCallback((err, fallback) => {
    if (err?.status === 401) {
      unauthorizedRef.current?.(err)
      return
    }
    errorRef.current?.(err?.message || fallback || 'Something went wrong. Please try again.', err)
  }, [])

  const runExclusive = useCallback(async (key, action, fallbackMessage) => {
    if (inflight.current.has(key)) return { ok: false, skipped: true }
    inflight.current.add(key)
    try {
      const result = await action()
      return { ok: true, result }
    } catch (err) {
      report(err, fallbackMessage)
      return { ok: false, err }
    } finally {
      inflight.current.delete(key)
      settledRef.current?.()
    }
  }, [report])

  const changeStatus = useCallback(async (task, nextStatus, { optimistic } = {}) => {
    if (!task?.id || !nextStatus || task.status === nextStatus) return { ok: false, skipped: true }
    const key = `status:${task.id}`
    if (inflight.current.has(key)) return { ok: false, skipped: true }

    inflight.current.add(key)
    setPendingStatusIds((prev) => new Set(prev).add(task.id))
    const rollback = typeof optimistic === 'function' ? optimistic(task, nextStatus) : null
    try {
      await updateTaskStatus(task.id, nextStatus)
      return { ok: true }
    } catch (err) {
      if (typeof rollback === 'function') rollback(err)
      report(err, 'Could not update task status.')
      return { ok: false, err }
    } finally {
      inflight.current.delete(key)
      setPendingStatusIds((prev) => {
        const next = new Set(prev)
        next.delete(task.id)
        return next
      })
      settledRef.current?.()
    }
  }, [report])

  return {
    pendingStatusIds,
    isStatusPending: (id) => pendingStatusIds.has(id),
    runExclusive,
    changeStatus,
  }
}
