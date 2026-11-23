import { useCallback } from 'react'
import {
  addFavorite as addFavoriteRequest,
  attachTag as attachTagRequest,
  detachTag as detachTagRequest,
  getDocument,
  removeFavorite as removeFavoriteRequest,
  restoreDocument as restoreDocumentRequest,
  restoreDocumentVersion as restoreDocumentVersionRequest,
  trashDocument as trashDocumentRequest,
  updateDocument as updateDocumentRequest,
} from '../api/client.js'
import { useResource } from './useResource.js'

/**
 * A single document detail (title, content, folder object, tags,
 * per-user favorite flag).
 *
 * `update` sends a PATCH with only the provided fields; the backend bumps
 * `updated_at` automatically and snapshots a version whenever title or
 * content change. The autosave debounce lives in the editor component.
 */
export function useDocument(documentId) {
  const resource = useResource(
    () => (documentId ? getDocument(documentId) : Promise.resolve(null)),
    [documentId],
  )

  const update = useCallback(
    async (patch) => {
      if (!documentId) throw new Error('No document selected')
      const updated = await updateDocumentRequest(documentId, patch)
      // Merge into existing detail to avoid a full reload (which causes editor
      // jank during autosave). Detail-only fields not present in the PATCH
      // response are preserved.
      resource.setData((current) => {
        if (!current || current.id !== updated.id) return current
        return { ...current, ...updated }
      })
      return updated
    },
    [documentId, resource],
  )

  const toggleFavorite = useCallback(async () => {
    const current = resource.data
    if (!current) return
    if (current.is_favorite) {
      await removeFavoriteRequest(current.id)
    } else {
      await addFavoriteRequest(current.id)
    }
    resource.reload()
  }, [resource])

  const attachTag = useCallback(
    async (tagId) => {
      if (!documentId) throw new Error('No document selected')
      await attachTagRequest(documentId, tagId)
      resource.reload()
    },
    [documentId, resource],
  )

  const detachTag = useCallback(
    async (tagId) => {
      if (!documentId) throw new Error('No document selected')
      await detachTagRequest(documentId, tagId)
      resource.reload()
    },
    [documentId, resource],
  )

  const trash = useCallback(
    async () => {
      if (!documentId) throw new Error('No document selected')
      await trashDocumentRequest(documentId)
    },
    [documentId],
  )

  const restore = useCallback(
    async () => {
      if (!documentId) throw new Error('No document selected')
      const restored = await restoreDocumentRequest(documentId)
      resource.reload()
      return restored
    },
    [documentId, resource],
  )

  const restoreVersion = useCallback(
    async (versionNumber) => {
      if (!documentId) throw new Error('No document selected')
      const current = resource.data
      if (!current?.updated_at) throw new Error('Document state is not loaded')
      const restored = await restoreDocumentVersionRequest(
        documentId,
        versionNumber,
        { expectedUpdatedAt: current.updated_at },
      )
      resource.reload()
      return restored
    },
    [documentId, resource],
  )

  return {
    ...resource,
    update,
    toggleFavorite,
    attachTag,
    detachTag,
    trash,
    restore,
    restoreVersion,
  }
}
