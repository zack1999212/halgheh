/** Presentation helpers for workspace activity records (no backend logic). */

const ACTION_PHRASES = {
  'workspace.created': 'created the workspace',
  'workspace.renamed': 'renamed the workspace',
  'workspace.description_changed': 'changed the workspace description',
  'member.invited': 'invited a member',
  'invitation.accepted': 'joined the workspace',
  'invitation.declined': 'declined an invitation',
  'invitation.revoked': 'revoked an invitation',
  'member.removed': 'removed a member',
  'member.role_changed': 'changed a member role',
  'member.left': 'left the workspace',
  'task.created': 'created task',
  'task.updated': 'updated task',
  'task.title_changed': 'renamed task',
  'task.description_changed': 'updated task',
  'task.completed': 'completed task',
  'task.reopened': 'reopened task',
  'task.deleted': 'deleted task',
  'task.assigned': 'assigned task',
  'task.unassigned': 'unassigned task',
  'task.due_date_changed': 'changed the due date of task',
  'task.priority_changed': 'changed the priority of task',
  'task.status_changed': 'changed the status of task',
  'subtask.created': 'created subtask',
  'subtask.completed': 'completed subtask',
  'subtask.reopened': 'reopened subtask',
  'subtask.deleted': 'deleted subtask',
  'task.attached': 'attached task',
  'task.detached': 'detached task',
  'document.created': 'created document',
  'document.renamed': 'renamed document',
  'document.updated': 'updated document',
  'document.deleted': 'deleted document',
  'document.restored': 'restored document',
  'document.attached': 'attached document',
  'document.detached': 'detached document',
  'event.created': 'created event',
  'event.updated': 'updated event',
  'event.deleted': 'deleted event',
  'event.restored': 'restored event',
  'event.attached': 'attached event',
  'event.detached': 'detached event',
  'milestone.created': 'created milestone',
  'milestone.updated': 'updated milestone',
  'milestone.completed': 'completed milestone',
  'milestone.reopened': 'reopened milestone',
  'milestone.deleted': 'deleted milestone',
  'milestone_step.created': 'created milestone step',
  'milestone_step.updated': 'updated milestone step',
  'milestone_step.completed': 'completed milestone step',
  'milestone_step.reopened': 'reopened milestone step',
  'milestone_step.deleted': 'deleted milestone step',
}

export function actorName(item) {
  const actor = item?.actor
  return actor?.name || actor?.username || (actor?.id ? `User #${actor.id}` : 'Someone')
}

export function resourceName(item) {
  const meta = item?.metadata || {}
  return (
    meta.resource_name ||
    meta.task_title ||
    meta.document_title ||
    meta.invitee_username ||
    meta.workspace_name ||
    null
  )
}

export function activityPhrase(item) {
  return ACTION_PHRASES[item?.event_type] || 'updated'
}

export function activitySentence(item) {
  const phrase = activityPhrase(item)
  const name = resourceName(item)
  const withResource = name && !phrase.includes('workspace') ? ` ${phrase} “${name}”` : ` ${phrase}`
  return `${actorName(item)}${withResource}.`
}

/** Link to an existing detail page, or null for deleted/historical records. */
export function activityLink(item) {
  const type = item?.entity_type
  const eventType = item?.event_type || ''
  if (eventType.includes('.deleted')) return null
  if (type === 'document' && item.entity_id != null) {
    return { to: `/documents/${item.entity_id}`, label: resourceName(item) || 'Open document' }
  }
  if (type === 'task') {
    return { to: '/tasks', label: resourceName(item) || 'Open tasks' }
  }
  if (type === 'event' || type === 'calendar_event') {
    return { to: '/calendar', label: resourceName(item) || 'Open calendar' }
  }
  return null
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

export function activityGroup(createdAt) {
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return 'Older'
  const today = startOfDay(new Date())
  const day = startOfDay(date)
  const diffDays = Math.round((today - day) / 86400000)
  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays <= 7) return 'Earlier this week'
  return 'Older'
}

export const ACTIVITY_GROUPS = ['Today', 'Yesterday', 'Earlier this week', 'Older']

export const ACTIVITY_FILTERS = [
  { value: '', label: 'All activity' },
  { value: 'workspace', label: 'Workspace & members' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'documents', label: 'Documents' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'milestones', label: 'Milestones' },
]
