import { Calendar, FileText, LayoutGrid, ListChecks, Settings } from 'lucide-react'

/** Primary application sections rendered in the sidebar. */
export const NAV_ITEMS = [
  { to: '/workspace', label: 'Workspace', icon: LayoutGrid },
  { to: '/calendar', label: 'Calendar', icon: Calendar },
  { to: '/tasks', label: 'Tasks', icon: ListChecks },
  { to: '/documents', label: 'Documents', icon: FileText },
  { to: '/settings/ai', label: 'AI Settings', icon: Settings },
]

/** Resolves the navigation entry for a pathname, for the header title. */
export function findNavItem(pathname) {
  return (
    NAV_ITEMS.find(
      (item) => pathname === item.to || pathname.startsWith(`${item.to}/`),
    ) || null
  )
}
