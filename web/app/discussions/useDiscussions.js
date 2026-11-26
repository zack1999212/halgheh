import { useCallback, useEffect, useRef, useState } from 'react'
import { listDiscussions } from './api.js'

/** Discussions of one workspace, loaded on mount and after actions. */
export default function useDiscussions({ workspaceId, type, onUnauthorized } = {}) {
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
      const data = await listDiscussions(workspaceId, {
        type,
        limit: 100,
      })
      setItems(Array.isArray(data?.items) ? data.items : [])
    } catch (err) {
      if (err?.status === 401) {
        unauthorizedRef.current?.()
      } else {
        setError(err?.message || 'Could not load discussions.')
      }
    } finally {
      setLoading(false)
    }
  }, [workspaceId, type])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { items, loading, error, refresh, setItems }
}
