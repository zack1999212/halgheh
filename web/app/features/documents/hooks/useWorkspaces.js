import { useCallback, useState } from 'react'
import {
  createWorkspace as createWorkspaceRequest,
  listWorkspaces,
} from '../api/client.js'
import { useResource } from './useResource.js'

/**
 * Workspaces owned by the current user (the API only ever returns the
 * caller's own workspaces).
 */
export function useWorkspaces() {
  const resource = useResource(
    () => listWorkspaces({ limit: 200 }).then((data) => data.items),
    [],
  )

  const [creating, setCreating] = useState(false)

  const create = useCallback(
    async (payload) => {
      setCreating(true)
      try {
        const workspace = await createWorkspaceRequest(payload)
        resource.reload()
        return workspace
      } finally {
        setCreating(false)
      }
    },
    [resource],
  )

  return { ...resource, create, creating }
}
