import { useCallback } from 'react'
import {
  createFolder as createFolderRequest,
  deleteFolder as deleteFolderRequest,
  getFolderTree,
  updateFolder as updateFolderRequest,
} from '../api/client.js'
import { useResource } from './useResource.js'

/**
 * The full folder hierarchy of one workspace.
 *
 * Mutations rethrow their errors so dialogs can surface them, then refresh
 * the tree on success. Deleting a folder never deletes documents: the
 * backend moves contained documents to the workspace root.
 */
export function useFolderTree(workspaceId) {
  const resource = useResource(
    () =>
      workspaceId
        ? getFolderTree(workspaceId)
        : Promise.resolve({ items: [], total: 0 }),
    [workspaceId],
  )

  const create = useCallback(
    async ({ parentId, name }) => {
      if (!workspaceId) throw new Error('No vault selected')
      const folder = await createFolderRequest({
        workspaceId,
        parentId: parentId ?? null,
        name,
      })
      resource.reload()
      return folder
    },
    [workspaceId, resource],
  )

  const rename = useCallback(
    async (folderId, name) => {
      const folder = await updateFolderRequest(folderId, { name })
      resource.reload()
      return folder
    },
    [resource],
  )

  /** parentId: null moves the folder (and its subtree) to the root. */
  const move = useCallback(
    async (folderId, parentId) => {
      const folder = await updateFolderRequest(folderId, { parentId })
      resource.reload()
      return folder
    },
    [resource],
  )

  const remove = useCallback(
    async (folderId) => {
      await deleteFolderRequest(folderId)
      resource.reload()
    },
    [resource],
  )

  return { ...resource, create, rename, move, remove }
}
