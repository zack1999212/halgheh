import { Outlet } from 'react-router-dom'

/**
 * Tasks module layout boundary.
 * Prepared for future task-specific sidebar/navigation without changing the app shell.
 */
export default function TasksLayout() {
  return (
    <div className="module-layout module-layout--tasks min-w-0">
      <Outlet />
    </div>
  )
}
