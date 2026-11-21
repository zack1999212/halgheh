import { useCallback, useEffect, useRef, useState } from 'react'
import { listProjectActivity } from '../api.js'

function normalizeEventTypes(eventTypes) {
  if (!eventTypes) return undefined
  const arr = Array.isArray(eventTypes) ? eventTypes : [eventTypes]
  const cleaned = arr.filter((v) => typeof v === 'string' && v.trim())
  return cleaned.length ? cleaned : undefined
}

export default function useProjectActivity({
  projectId,
  eventTypes,
  limit = 20,
  enabled = true,
  onUnauthorized,
} = {}) {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(Boolean(enabled && projectId))
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const offsetRef = useRef(0)
  const requestRef = useRef(0)
  const itemsRef = useRef([])
  const unauthorizedRef = useRef(onUnauthorized)

  useEffect(() => {
    unauthorizedRef.current = onUnauthorized
  }, [onUnauthorized])

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  const normalizedTypes = normalizeEventTypes(eventTypes)
  const filterKey = JSON.stringify(normalizedTypes || [])

  const fetchPage = useCallback(async ({ reset = false } = {}) => {
    if (!enabled || !projectId) {
      setItems([])
      setTotal(0)
      setError('')
      setLoading(false)
      setLoadingMore(false)
      offsetRef.current = 0
      return
    }

    const nextOffset = reset ? 0 : offsetRef.current
    const reqId = ++requestRef.current

    if (reset) {
      setLoading(true)
      setError('')
    } else {
      setLoadingMore(true)
      setError('')
    }

    try {
      const res = await listProjectActivity(projectId, {
        limit,
        offset: nextOffset,
        ...(normalizedTypes ? { event_type: normalizedTypes } : {}),
      })
      if (reqId !== requestRef.current) return

      const incoming = Array.isArray(res?.items) ? res.items : []
      const nextTotal = Number.isFinite(res?.total) ? res.total : incoming.length

      setItems((prev) => {
        const base = reset ? [] : prev
        const seen = new Set(base.map((item) => item?.id))
        const merged = [...base]
        for (const item of incoming) {
          if (!item || seen.has(item.id)) continue
          seen.add(item.id)
          merged.push(item)
        }
        return merged
      })
      setTotal(nextTotal)
      offsetRef.current = nextOffset + incoming.length
    } catch (err) {
      if (reqId !== requestRef.current) return
      if (err?.status === 401) {
        unauthorizedRef.current?.()
        return
      }
      setError(err?.message || 'Could not load project activity.')
      if (reset) {
        setItems([])
        setTotal(0)
        offsetRef.current = 0
      }
    } finally {
      if (reqId === requestRef.current) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [enabled, projectId, limit, filterKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    offsetRef.current = 0
    fetchPage({ reset: true })
  }, [fetchPage])

  const loadMore = useCallback(() => {
    if (loading || loadingMore) return
    if (itemsRef.current.length >= total) return
    fetchPage({ reset: false })
  }, [fetchPage, loading, loadingMore, total])

  const reload = useCallback(() => {
    offsetRef.current = 0
    fetchPage({ reset: true })
  }, [fetchPage])

  const hasMore = items.length < total

  return {
    items,
    total,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    reload,
  }
}
