import { useCallback } from 'react'
import {
  createDocumentLink as createDocumentLinkRequest,
  deleteDocumentLink as deleteDocumentLinkRequest,
  getDocumentLinks,
} from '../api/client.js'
import { useResource } from './useResource.js'

/**
 * Explicit links of one document.
 *
 * `incoming` powers the Backlinks panel, `outgoing` (plus same-tag
 * suggestions computed by the panel) powers Related documents.
 */
export function useDocumentLinks(documentId) {
  const resource = useResource(
    () =>
      documentId
        ? getDocumentLinks(documentId)
        : Promise.resolve({ outgoing: [], incoming: [] }),
    [documentId],
  )

  const createLink = useCallback(
    async ({ targetDocumentId, linkType }) => {
      if (!documentId) throw new Error('No document selected')
      const link = await createDocumentLinkRequest(documentId, {
        targetDocumentId,
        linkType,
      })
      resource.reload()
      return link
    },
    [documentId, resource],
  )

  const removeLink = useCallback(
    async (linkId) => {
      if (!documentId) throw new Error('No document selected')
      await deleteDocumentLinkRequest(documentId, linkId)
      resource.reload()
    },
    [documentId, resource],
  )

  return { ...resource, createLink, removeLink }
}
