import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addFavorite as addFavoriteRequest,
  createDocument as createDocumentRequest,
  listDocuments,
  listFavorites,
  removeFavorite as removeFavoriteRequest,
  restoreDocument as restoreDocumentRequest,
  trashDocument as trashDocumentRequest,
} from '../api/client.js'

const PAGE_SIZE = 50

/**
 * The document list for the active sidebar filter.
 *
 * mode: 'documents' (workspace/folder/search/tag view) | 'favorites' |
 * 'trash' | 'archived'. Favorites are per-user and workspace-independent,
 * so that mode uses the dedicated favorites endpoint.
 */
export function useDocumentList({
  workspaceId,
  folderId,
  query,
  tagId,
  mode = 'documents',
} = {}) {
  const [state, setState] = useState({
    status: 'loading',
    items: null,
    total: 0,
    error: null,
  })
  const [offset, setOffset] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const requestIdRef = useRef(0)

  const fetchPage = useCallback(
    (nextOffset) => {
      if (mode === 'favorites') {
        return listFavorites({ limit: PAGE_SIZE, offset: nextOffset })
      }
      return listDocuments({
        workspaceId,
        folderId,
        query: query || undefined,
        tagId,
        isDeleted: mode === 'trash' ? true : false,
        isArchived: mode === 'archived' ? true : undefined,
        sort: 'updated_desc',
        limit: PAGE_SIZE,
        offset: nextOffset,
      })
    },
    [workspaceId, folderId, query, tagId, mode],
  )

  const loadInitial = useCallback(() => {
    const requestId = ++requestIdRef.current
    setState({ status: 'loading', items: null, total: 0, error: null })
    setOffset(0)
    setLoadingMore(false)
    fetchPage(0)
      .then((data) => {
        if (requestId !== requestIdRef.current) return
        setState({
          status: 'ready',
          items: data.items || [],
          total: data.total ?? 0,
          error: null,
        })
        setOffset((data.items || []).length)
      })
      .catch((error) => {
        if (requestId !== requestIdRef.current) return
        setState({ status: 'error', items: null, total: 0, error })
      })
  }, [fetchPage])

  useEffect(() => {
    loadInitial()
  }, [loadInitial])

  const loadMore = useCallback(async () => {
    if (loadingMore) return
    if (!state.items || state.items.length >= state.total) return
    setLoadingMore(true)
    const requestId = requestIdRef.current
    try {
      const data = await fetchPage(offset)
      if (requestId !== requestIdRef.current) return
      setState((current) => ({
        ...current,
        status: 'ready',
        items: [...(current.items || []), ...(data.items || [])],
        total: data.total ?? current.total,
        error: null,
      }))
      setOffset((current) => current + (data.items || []).length)
    } catch (error) {
      if (requestId !== requestIdRef.current) return
      setState((current) => ({ ...current, error }))
    } finally {
      if (requestId === requestIdRef.current) {
        setLoadingMore(false)
      }
    }
  }, [fetchPage, loadingMore, offset, state.items, state.total])

  const reload = useCallback(() => {
    loadInitial()
  }, [loadInitial])

  const documents = state.items
  const total = state.total
  const hasMore = Boolean(documents && documents.length < total)

  const create = useCallback(
    async ({ title, content, folderId: targetFolderId }) => {
      if (!workspaceId) throw new Error('No workspace selected')
      const document = await createDocumentRequest({
        workspaceId,
        folderId: targetFolderId ?? folderId ?? null,
        title,
        content,
      })
      reload()
      return document
    },
    [workspaceId, folderId, reload],
  )

  const trash = useCallback(
    async (documentId) => {
      await trashDocumentRequest(documentId)
      reload()
    },
    [reload],
  )

  const restore = useCallback(
    async (documentId) => {
      await restoreDocumentRequest(documentId)
      reload()
    },
    [reload],
  )

  const toggleFavorite = useCallback(
    async (document) => {
      if (document.is_favorite) {
        await removeFavoriteRequest(document.id)
      } else {
        await addFavoriteRequest(document.id)
      }
      reload()
    },
    [reload],
  )

  return {
    status: state.status,
    error: state.error,
    data: documents ? { items: documents, total } : null,
    reload,
    loadMore,
    hasMore,
    loadingMore,
    documents,
    total,
    create,
    trash,
    restore,
    toggleFavorite,
  }
}
