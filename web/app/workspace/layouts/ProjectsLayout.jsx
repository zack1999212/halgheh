import { Outlet } from 'react-router-dom'

/**
 * Projects module layout boundary.
 * Landing page and project workspaces render inside this module route.
 */
export default function ProjectsLayout() {
  return (
    <div className="module-layout module-layout--projects min-w-0">
      <Outlet />
    </div>
  )
}
