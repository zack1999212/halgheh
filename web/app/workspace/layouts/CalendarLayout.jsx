import { Outlet } from 'react-router-dom'

/**
 * Calendar module layout boundary.
 * Calendar-specific navigation and views are owned by the Calendar page so they
 * only appear within the Calendar module.
 */
export default function CalendarLayout() {
  return (
    <div className="module-layout module-layout--calendar flex min-h-0 min-w-0 flex-1 flex-col">
      <Outlet />
    </div>
  )
}
