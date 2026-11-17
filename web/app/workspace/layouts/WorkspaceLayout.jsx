import { Outlet } from 'react-router-dom'

/**
 * Workspace module layout boundary.
 * Workspace currently has no module-specific sidebar/navigation.
 */
export default function WorkspaceLayout() {
  return (
    <div className="module-layout module-layout--workspace min-w-0">
      <Outlet />
    </div>
  )
}
