export const PROJECT_STATUSES = [
  { id: 'active', label: 'Active' },
  { id: 'on_hold', label: 'On hold' },
  { id: 'completed', label: 'Completed' },
  { id: 'archived', label: 'Archived' },
]

export const PROJECT_STATUS_LABELS = Object.fromEntries(
  PROJECT_STATUSES.map((s) => [s.id, s.label]),
)

export const PROJECT_COLORS = [
  '#FFC400',
  '#4D8DFF',
  '#A78BFA',
  '#39B980',
  '#EF6464',
  '#F97316',
  '#14B8A6',
  '#EC4899',
]

export const PROJECT_ICON_OPTIONS = [
  { id: 'folder', label: 'Folder' },
  { id: 'briefcase', label: 'Briefcase' },
  { id: 'rocket', label: 'Rocket' },
  { id: 'target', label: 'Target' },
  { id: 'sparkles', label: 'Sparkles' },
  { id: 'code', label: 'Code' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'users', label: 'Users' },
]

export function canEditProject(role) {
  return role === 'owner' || role === 'admin'
}

export function isProjectOwner(role) {
  return role === 'owner'
}
