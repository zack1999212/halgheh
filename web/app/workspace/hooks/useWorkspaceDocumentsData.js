import { useCallback, useEffect, useState } from 'react'
import { listDocuments } from '../../features/documents/api/client.js'

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
  }
}

/**
 * Loads recently modified documents for the dashboard.
 * Independent from calendar data; failures are contained to this section.
 */
export default function useWorkspaceDocumentsData({ onUnauthorized } = {}) {
  const [documents, setDocuments] = useState([])
  const [total, setTotal] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await listDocuments({
        sort: 'updated_desc',
        limit: 5,
        offset: 0,
        isDeleted: false,
      })
      const items = Array.isArray(data?.items) ? data.items : []
      setDocuments(items.map(normalizeDocument).filter(Boolean))
      setTotal(typeof data?.total === 'number' ? data.total : null)
    } catch (err) {
      if (err?.status === 401) {
        onUnauthorized?.()
        return
      }
      setError(err?.message || 'Could not load recent documents.')
      setDocuments([])
      setTotal(null)
    } finally {
      setLoading(false)
    }
  }, [onUnauthorized])

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
