import { useCallback, useEffect, useRef, useState } from 'react'
import { getTaskStatistics, listTasks } from '../api.js'

export default function useTasks({ query, onUnauthorized, loadStatistics = true }) {
  const unauthorizedRef = useRef(onUnauthorized)
  useEffect(() => {
    unauthorizedRef.current = onUnauthorized
  }, [onUnauthorized])

  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [statistics, setStatistics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(Boolean(loadStatistics))
  const [error, setError] = useState('')
  const [statsError, setStatsError] = useState('')
  const requestRef = useRef(0)
  const abortRef = useRef(null)
  const statsRequestRef = useRef(0)
  const statsAbortRef = useRef(null)

  const handleUnauthorized = useCallback((err) => {
    if (err?.status === 401) unauthorizedRef.current?.(err)
  }, [])

  const loadStats = useCallback(async () => {
    if (!loadStatistics) {
      setStatistics(null)
      setStatsLoading(false)
      setStatsError('')
      return
    }
    const requestId = ++statsRequestRef.current
    statsAbortRef.current?.abort()
    const controller = new AbortController()
    statsAbortRef.current = controller
    setStatsLoading(true)
    setStatsError('')
    try {
      const data = await getTaskStatistics({ signal: controller.signal })
      if (requestId !== statsRequestRef.current) return
      setStatistics(data || null)
    } catch (err) {
      if (err?.name === 'AbortError' || requestId !== statsRequestRef.current) return
      if (err?.status === 401) {
        handleUnauthorized(err)
        return
      }
      setStatsError(err?.message || 'Could not load task statistics.')
    } finally {
      if (requestId === statsRequestRef.current) setStatsLoading(false)
    }
  }, [handleUnauthorized, loadStatistics])

  const load = useCallback(async (nextQuery) => {
    const requestId = ++requestRef.current
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setError('')
    try {
      const data = await listTasks(nextQuery, { signal: controller.signal })
      if (requestId !== requestRef.current) return
      setItems(Array.isArray(data?.items) ? data.items : [])
      setTotal(Number.isFinite(data?.total) ? data.total : 0)
    } catch (err) {
      if (err?.name === 'AbortError' || requestId !== requestRef.current) return
      if (err?.status === 401) {
        handleUnauthorized(err)
        return
      }
      setError(err?.message || 'Could not load tasks.')
    } finally {
      if (requestId === requestRef.current) setLoading(false)
    }
  }, [handleUnauthorized])

  useEffect(() => {
    load(query)
  }, [load, query])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  useEffect(() => () => {
    abortRef.current?.abort()
    statsAbortRef.current?.abort()
  }, [])

  const reload = useCallback(() => {
    load(query)
    loadStats()
  }, [load, loadStats, query])

  const replaceItem = useCallback((taskId, updater) => {
    setItems((prev) => prev.map((item) => (item.id === taskId ? (typeof updater === 'function' ? updater(item) : { ...item, ...updater }) : item)))
  }, [])

  return {
    items,
    total,
    statistics,
    loading,
    statsLoading,
    error,
    statsError,
    reload,
    setItems,
    setTotal,
    replaceItem,
  }
}
