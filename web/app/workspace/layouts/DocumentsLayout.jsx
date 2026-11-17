import { Outlet } from 'react-router-dom'

/**
 * Documents module layout boundary.
 * Prepared for future document-specific sidebar/navigation without changing the app shell.
 */
export default function DocumentsLayout() {
  return (
    <div className="module-layout module-layout--documents min-w-0">
      <Outlet />
    </div>
  )
}
