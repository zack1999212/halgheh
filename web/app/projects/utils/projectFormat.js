import {
  Briefcase,
  Calendar,
  Code2,
  FolderKanban,
  Rocket,
  Sparkles,
  Target,
  Users,
} from 'lucide-react'

export const PROJECT_ICON_MAP = {
  folder: FolderKanban,
  briefcase: Briefcase,
  rocket: Rocket,
  target: Target,
  sparkles: Sparkles,
  code: Code2,
  calendar: Calendar,
  users: Users,
}

export function getProjectIcon(iconId) {
  return PROJECT_ICON_MAP[iconId] || FolderKanban
}

export function formatProjectDate(value) {
  if (!value) return null
  const d = new Date(`${value}T00:00:00`)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatDateTime(value, { isAllDay = false, startDate = null } = {}) {
  if (isAllDay && startDate) return formatProjectDate(startDate)
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatRole(role) {
  if (!role) return 'Unknown'
  return role.charAt(0).toUpperCase() + role.slice(1)
}
