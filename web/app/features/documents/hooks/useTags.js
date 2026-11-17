import { useCallback, useState } from 'react'
import {
  createTag as createTagRequest,
  listTags,
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

  return { ...resource, create, creating }
}
