import { useCallback, useEffect, useRef, useState } from 'react'
import { listAllWorkspaceActivity, listWorkspaceActivity } from '../api.js'

/**
 * Loads workspace activity with offset pagination. `workspaceId == null`
 * means All Workspaces, in which case the backend scopes results to every
 * workspace the user can access. Filters are sent to the backend, never
 * applied to the already-loaded page.
 */
export default function useWorkspaceActivityData({
  workspaceId,
  category = '',
  limit = 20,
  onUnauthorized,
} = {}) {
  const unauthorizedRef = useRef(onUnauthorized)
  useEffect(() => {
    unauthorizedRef.current = onUnauthorized
  }, [onUnauthorized])

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [total, setTotal] = useState(0)
  const itemsRef = useRef([])
  const requestRef = useRef(0)

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  const load = useCallback(
    async ({ reset = false } = {}) => {
      if (workspaceId === undefined) {
        setItems([])
        setLoading(false)
        return
      }
      const requestId = ++requestRef.current
      const offset = reset ? 0 : itemsRef.current.length
      setLoading(true)
      setError('')
      try {
        const options = {
          category: category || undefined,
          limit,
          offset,
        }
        const data =
          workspaceId == null
            ? await listAllWorkspaceActivity(options)
            : await listWorkspaceActivity(workspaceId, options)
        if (requestId !== requestRef.current) return
        const rows = Array.isArray(data?.items) ? data.items : []
        setItems((current) => (reset ? rows : [...current, ...rows]))
        setTotal(Number(data?.total) || 0)
      } catch (err) {
        if (requestId !== requestRef.current) return
        if (err?.status === 401) {
          unauthorizedRef.current?.()
          return
        }
        setError(err?.message || 'Could not load activity.')
        if (reset) setItems([])
      } finally {
        if (requestId === requestRef.current) setLoading(false)
      }
    },
    [workspaceId, category, limit],
  )

  useEffect(() => {
    load({ reset: true })
  }, [load])

  const reload = useCallback(() => load({ reset: true }), [load])
  const loadMore = useCallback(() => load(), [load])

  return {
    items,
    loading,
    error,
    total,
    hasMore: items.length < total,
    reload,
    loadMore,
  }
}
