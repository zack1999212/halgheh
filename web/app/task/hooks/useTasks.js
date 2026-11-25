import { useCallback, useEffect, useRef, useState } from 'react'
import { getTaskStatistics, listTasks } from '../api.js'

export default function useTasks({ query, onUnauthorized, loadStatistics = true }) {
  const unauthorizedRef = useRef(onUnauthorized)
  useEffect(() => { unauthorizedRef.current = onUnauthorized }, [onUnauthorized])

  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [statistics, setStatistics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [statsLoading, setStatsLoading] = useState(Boolean(loadStatistics))
  const [error, setError] = useState('')
  const [statsError, setStatsError] = useState('')
  const requestRef = useRef(0)
  const abortRef = useRef(null)
  const statsRequestRef = useRef(0)
  const statsAbortRef = useRef(null)
  const itemsRef = useRef([])
  useEffect(() => { itemsRef.current = items }, [items])

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
      if (err?.status === 401) { handleUnauthorized(err); return }
      setStatsError(err?.message || 'Could not load task statistics.')
    } finally {
      if (requestId === statsRequestRef.current) setStatsLoading(false)
    }
  }, [handleUnauthorized, loadStatistics])

  const load = useCallback(async (nextQuery, { append = false } = {}) => {
    const requestId = ++requestRef.current
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    if (append) setLoadingMore(true)
    else setLoading(true)
    setError('')
    try {
      const data = await listTasks(nextQuery, { signal: controller.signal })
      if (requestId !== requestRef.current) return
      const nextItems = Array.isArray(data?.items) ? data.items : []
      setTotal(Number.isFinite(data?.total) ? data.total : 0)
      setItems((prev) => {
        if (!append) return nextItems
        const seen = new Set(prev.map((i) => i.id))
        return [...prev, ...nextItems.filter((i) => !seen.has(i.id))]
      })
    } catch (err) {
      if (err?.name === 'AbortError' || requestId !== requestRef.current) return
      if (err?.status === 401) { handleUnauthorized(err); return }
      setError(err?.message || 'Could not load tasks.')
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [handleUnauthorized])

  // Reset and load when query changes. The query should represent filters/sort/mode
  // and have offset 0 for the base page.
  useEffect(() => {
    load({ ...query, offset: 0 })
  }, [load, query])

  useEffect(() => { loadStats() }, [loadStats])
  useEffect(() => () => { abortRef.current?.abort(); statsAbortRef.current?.abort() }, [])

  const reload = useCallback(() => {
    load({ ...query, offset: 0 })
    loadStats()
  }, [load, loadStats, query])

  const loadMore = useCallback(() => {
    if (loading || loadingMore) return
    const current = itemsRef.current
    if (current.length >= total) return
    load({ ...query, offset: current.length }, { append: true })
  }, [load, query, loading, loadingMore, total])

  const replaceItem = useCallback((taskId, updater) => {
    setItems((prev) => prev.map((item) => (item.id === taskId ? (typeof updater === 'function' ? updater(item) : { ...item, ...updater }) : item)))
  }, [])

  return {
    items, total, statistics,
    loading, loadingMore, statsLoading,
    error, statsError,
    hasMore: items.length < total,
    reload, loadMore, setItems, setTotal, replaceItem,
  }
}
