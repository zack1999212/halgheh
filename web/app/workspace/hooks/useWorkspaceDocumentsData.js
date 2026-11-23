import { useCallback, useEffect, useRef, useState } from 'react'
import { listDocuments } from '../../features/documents/api/client.js'
import { ALL_WORKSPACES } from '../constants.js'

function normalizeDocument(doc) {
  if (!doc) return null
  return {
    id: doc.id,
    title: doc.title || doc.slug || 'Untitled document',
    icon: doc.icon || '',
    updatedAt: doc.updated_at || doc.created_at || null,
    createdAt: doc.created_at || null,
    workspaceId: doc.workspace_id ?? null,
    folderId: doc.folder_id ?? null,
    slug: doc.slug || '',
    workspaces: Array.isArray(doc.workspaces) ? doc.workspaces : [],
  }
}

/**
 * Loads recently modified documents for the selected workspace dashboard.
 */
export default function useWorkspaceDocumentsData({ onUnauthorized, workspaceId } = {}) {
  const [documents, setDocuments] = useState([])
  const [total, setTotal] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const requestRef = useRef(0)
  const unauthorizedRef = useRef(onUnauthorized)

  useEffect(() => {
    unauthorizedRef.current = onUnauthorized
  }, [onUnauthorized])

  const load = useCallback(async () => {
    const requestId = ++requestRef.current

    if (workspaceId == null) {
      setDocuments([])
      setTotal(null)
      setError('')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    setDocuments([])
    setTotal(null)
    try {
      const data = await listDocuments({
        ...(workspaceId === ALL_WORKSPACES ? {} : { workspaceId }),
        sort: 'updated_desc',
        limit: 5,
        offset: 0,
        isDeleted: false,
      })
      if (requestId !== requestRef.current) return
      const items = Array.isArray(data?.items) ? data.items : []
      setDocuments(items.map(normalizeDocument).filter(Boolean))
      setTotal(typeof data?.total === 'number' ? data.total : null)
    } catch (err) {
      if (requestId !== requestRef.current) return
      if (err?.status === 401) {
        unauthorizedRef.current?.()
        return
      }
      setError(err?.message || 'Could not load recent documents.')
      setDocuments([])
      setTotal(null)
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false)
      }
    }
  }, [workspaceId])

  useEffect(() => {
    load()
  }, [load])

  return {
    documents,
    total,
    loading,
    error,
    reload: load,
  }
}
