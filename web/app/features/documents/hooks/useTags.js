import { useCallback, useState } from 'react'
import {
  createTag as createTagRequest,
  deleteTag as deleteTagRequest,
  listTags,
  updateTag as updateTagRequest,
} from '../api/client.js'
import { useResource } from './useResource.js'

/**
 * Tag catalog of one workspace (used by the sidebar filter and the right
 * panel's tag picker). Colors are hex strings like "#22c55e" — the backend
 * validates the format.
 */
export function useTags(workspaceId) {
  const resource = useResource(
    () =>
      workspaceId
        ? listTags(workspaceId, { limit: 200 }).then((data) => data.items)
        : Promise.resolve([]),
    [workspaceId],
  )

  const [creating, setCreating] = useState(false)
  const [mutating, setMutating] = useState(false)

  const create = useCallback(
    async ({ name, color }) => {
      if (!workspaceId) throw new Error('No workspace selected')
      setCreating(true)
      try {
        const tag = await createTagRequest({ workspaceId, name, color })
        resource.reload()
        return tag
      } finally {
        setCreating(false)
      }
    },
    [workspaceId, resource],
  )

  const update = useCallback(
    async (tagId, patch) => {
      setMutating(true)
      try {
        const tag = await updateTagRequest(tagId, patch)
        resource.reload()
        return tag
      } finally {
        setMutating(false)
      }
    },
    [resource],
  )

  const remove = useCallback(
    async (tagId) => {
      setMutating(true)
      try {
        await deleteTagRequest(tagId)
        resource.reload()
      } finally {
        setMutating(false)
      }
    },
    [resource],
  )

  return { ...resource, create, update, remove, creating, mutating }
}
