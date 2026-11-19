import { Calendar, FileText, FolderKanban, LayoutGrid, ListChecks, Settings } from 'lucide-react'

/** Primary application sections rendered in the sidebar. */
export const NAV_ITEMS = [
  { to: '/workspace', label: 'Workspace', icon: LayoutGrid },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/calendar', label: 'Calendar', icon: Calendar },
  { to: '/tasks', label: 'Tasks', icon: ListChecks },
  { to: '/documents', label: 'Documents', icon: FileText },
  { to: '/settings/ai', label: 'AI Settings', icon: Settings },
]

/**
 * Shared active-route rule: a section is active on its own route and on any
 * descendant route, so nested pages keep the sidebar entry highlighted.
 */
export function isNavItemActive(item, pathname) {
  if (!item) {
    return false
  }
  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}

/** Resolves the navigation entry for a pathname, for the header title. */
export function findNavItem(pathname) {
  return NAV_ITEMS.find((item) => isNavItemActive(item, pathname)) || null
}
