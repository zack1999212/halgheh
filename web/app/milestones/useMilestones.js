import { useCallback, useEffect, useRef, useState } from 'react'
import { listMilestones } from './api.js'

/**
 * Milestones of one workspace. The workspace id comes from the active
 * workspace context; no polling — data is loaded once and after actions.
 */
export default function useMilestones({ workspaceId, onUnauthorized } = {}) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const unauthorizedRef = useRef(onUnauthorized)

  useEffect(() => {
    unauthorizedRef.current = onUnauthorized
  }, [onUnauthorized])

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const data = await listMilestones(workspaceId, { limit: 100 })
      setItems(Array.isArray(data?.items) ? data.items : [])
    } catch (err) {
      if (err?.status === 401) {
        unauthorizedRef.current?.()
      } else {
        setError(err?.message || 'Could not load milestones.')
      }
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { items, loading, error, refresh, setItems }
}
