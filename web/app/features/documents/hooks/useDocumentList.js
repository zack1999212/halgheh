import { useCallback } from 'react'
import {
  addFavorite as addFavoriteRequest,
  createDocument as createDocumentRequest,
  listDocuments,
  listFavorites,
  removeFavorite as removeFavoriteRequest,
  restoreDocument as restoreDocumentRequest,
  trashDocument as trashDocumentRequest,
} from '../api/client.js'
import { useResource } from './useResource.js'

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
  const resource = useResource(() => {
    if (mode === 'favorites') {
      return listFavorites({ limit: 200 })
    }
    return listDocuments({
      workspaceId,
      folderId,
      query: query || undefined,
      tagId,
      isDeleted: mode === 'trash' ? true : false,
      isArchived: mode === 'archived' ? true : undefined,
      sort: 'updated_desc',
      limit: 200,
    })
  }, [workspaceId, folderId, query, tagId, mode])

  const documents = resource.data ? resource.data.items : null
  const total = resource.data ? resource.data.total : 0

  const create = useCallback(
    async ({ title, content, folderId: targetFolderId }) => {
      if (!workspaceId) throw new Error('No workspace selected')
      const document = await createDocumentRequest({
        workspaceId,
        folderId: targetFolderId ?? folderId ?? null,
        title,
        content,
      })
      resource.reload()
      return document
    },
    [workspaceId, folderId, resource],
  )

  const trash = useCallback(
    async (documentId) => {
      await trashDocumentRequest(documentId)
      resource.reload()
    },
    [resource],
  )

  const restore = useCallback(
    async (documentId) => {
      await restoreDocumentRequest(documentId)
      resource.reload()
    },
    [resource],
  )

  const toggleFavorite = useCallback(
    async (document) => {
      if (document.is_favorite) {
        await removeFavoriteRequest(document.id)
      } else {
        await addFavoriteRequest(document.id)
      }
      resource.reload()
    },
    [resource],
  )

  return { ...resource, documents, total, create, trash, restore, toggleFavorite }
}
