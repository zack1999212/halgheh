import {
  CalendarDays,
  CheckCircle2,
  FilePenLine,
  FilePlus2,
  Flag,
  ListPlus,
  UserPlus,
  UserRoundCog,
} from 'lucide-react'

export const ACTIVITY_EVENT_TYPES = {
  TASK_CREATED: 'task.created',
  TASK_COMPLETED: 'task.completed',
  TASK_REASSIGNED: 'task.reassigned',
  DOCUMENT_CREATED: 'document.created',
  DOCUMENT_UPDATED: 'document.updated',
  MILESTONE_STEP_COMPLETED: 'milestone_step.completed',
  MEMBER_JOINED: 'member.joined',
  CALENDAR_EVENT_CREATED: 'calendar_event.created',
  CALENDAR_EVENT_UPDATED: 'calendar_event.updated',
}

export const ACTIVITY_FILTERS = [
  { id: 'all', label: 'All', eventTypes: null },
  { id: 'tasks', label: 'Tasks', eventTypes: [ACTIVITY_EVENT_TYPES.TASK_CREATED, ACTIVITY_EVENT_TYPES.TASK_COMPLETED, ACTIVITY_EVENT_TYPES.TASK_REASSIGNED] },
  { id: 'documents', label: 'Documents', eventTypes: [ACTIVITY_EVENT_TYPES.DOCUMENT_CREATED, ACTIVITY_EVENT_TYPES.DOCUMENT_UPDATED] },
  { id: 'milestones', label: 'Milestones', eventTypes: [ACTIVITY_EVENT_TYPES.MILESTONE_STEP_COMPLETED] },
  { id: 'members', label: 'Members', eventTypes: [ACTIVITY_EVENT_TYPES.MEMBER_JOINED] },
  { id: 'calendar', label: 'Calendar', eventTypes: [ACTIVITY_EVENT_TYPES.CALENDAR_EVENT_CREATED, ACTIVITY_EVENT_TYPES.CALENDAR_EVENT_UPDATED] },
]

const EVENT_CONFIG = {
  [ACTIVITY_EVENT_TYPES.TASK_CREATED]: {
    icon: ListPlus,
    verb: 'created task',
    entityLabel: 'Task',
    tone: 'task',
  },
  [ACTIVITY_EVENT_TYPES.TASK_COMPLETED]: {
    icon: CheckCircle2,
    verb: 'completed task',
    entityLabel: 'Task',
    tone: 'task',
  },
  [ACTIVITY_EVENT_TYPES.TASK_REASSIGNED]: {
    icon: UserRoundCog,
    verb: 'reassigned task',
    entityLabel: 'Task',
    tone: 'task',
  },
  [ACTIVITY_EVENT_TYPES.DOCUMENT_CREATED]: {
    icon: FilePlus2,
    verb: 'created document',
    entityLabel: 'Document',
    tone: 'document',
  },
  [ACTIVITY_EVENT_TYPES.DOCUMENT_UPDATED]: {
    icon: FilePenLine,
    verb: 'updated document',
    entityLabel: 'Document',
    tone: 'document',
  },
  [ACTIVITY_EVENT_TYPES.MILESTONE_STEP_COMPLETED]: {
    icon: Flag,
    verb: 'completed milestone step',
    entityLabel: 'Milestone',
    tone: 'milestone',
  },
  [ACTIVITY_EVENT_TYPES.MEMBER_JOINED]: {
    icon: UserPlus,
    verb: 'joined the project',
    entityLabel: 'Member',
    tone: 'member',
  },
  [ACTIVITY_EVENT_TYPES.CALENDAR_EVENT_CREATED]: {
    icon: CalendarDays,
    verb: 'created calendar event',
    entityLabel: 'Calendar',
    tone: 'calendar',
  },
  [ACTIVITY_EVENT_TYPES.CALENDAR_EVENT_UPDATED]: {
    icon: CalendarDays,
    verb: 'updated calendar event',
    entityLabel: 'Calendar',
    tone: 'calendar',
  },
}

export function getActivityEventConfig(eventType) {
  return EVENT_CONFIG[eventType] || {
    icon: Flag,
    verb: 'performed activity',
    entityLabel: 'Activity',
    tone: 'default',
  }
}

function asText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function nameFromUser(user) {
  if (!user || typeof user !== 'object') return null
  return asText(user.name) || asText(user.username) || (user.user_id != null ? `User ${user.user_id}` : null)
}

function namesFromUsers(users) {
  if (!Array.isArray(users)) return []
  return users.map(nameFromUser).filter(Boolean)
}

export function getActivityActorName(activity) {
  const actor = activity?.actor
  return asText(actor?.name) || asText(actor?.username) || (actor?.id != null ? `User ${actor.id}` : 'Someone')
}

export function getActivityEntityTitle(activity) {
  const md = activity?.metadata || {}
  return (
    asText(md.task_title)
    || asText(md.document_title)
    || asText(md.event_title)
    || asText(md.step_title)
    || asText(md.milestone_title)
    || asText(md.username)
    || asText(md.name)
    || null
  )
}

export function getActivityDescription(activity) {
  const cfg = getActivityEventConfig(activity?.event_type)
  const md = activity?.metadata || {}
  const actor = getActivityActorName(activity)

  const taskTitle = asText(md.task_title)
  const docTitle = asText(md.document_title)
  const eventTitle = asText(md.event_title)
  const stepTitle = asText(md.step_title)
  const milestoneTitle = asText(md.milestone_title)
  const memberName = asText(md.name) || asText(md.username)

  switch (activity?.event_type) {
    case ACTIVITY_EVENT_TYPES.TASK_CREATED:
      return { actor, action: 'created task', target: taskTitle || 'Untitled task', detail: null }
    case ACTIVITY_EVENT_TYPES.TASK_COMPLETED:
      return { actor, action: 'completed task', target: taskTitle || 'Untitled task', detail: null }
    case ACTIVITY_EVENT_TYPES.TASK_REASSIGNED: {
      const prev = namesFromUsers(md.previous_assignees)
      const next = namesFromUsers(md.new_assignees)
      const nextSingle = nameFromUser(md.new_assignee)
      const nextNames = next.length ? next : (nextSingle ? [nextSingle] : [])
      let detail = null
      if (prev.length || nextNames.length) {
        const prevText = prev.length ? prev.join(', ') : 'Unassigned'
        const nextText = nextNames.length ? nextNames.join(', ') : 'Unassigned'
        detail = `${prevText} → ${nextText}`
      }
      return { actor, action: 'reassigned task', target: taskTitle || 'Untitled task', detail }
    }
    case ACTIVITY_EVENT_TYPES.DOCUMENT_CREATED:
      return { actor, action: 'created document', target: docTitle || 'Untitled document', detail: null }
    case ACTIVITY_EVENT_TYPES.DOCUMENT_UPDATED:
      return { actor, action: 'updated document', target: docTitle || 'Untitled document', detail: null }
    case ACTIVITY_EVENT_TYPES.MILESTONE_STEP_COMPLETED: {
      const milestone = milestoneTitle || 'Milestone'
      const step = stepTitle || 'Step'
      return { actor, action: 'completed milestone step', target: step, detail: milestone }
    }
    case ACTIVITY_EVENT_TYPES.MEMBER_JOINED: {
      const who = memberName || actor
      const role = asText(md.role)
      return { actor: who, action: 'joined the project', target: null, detail: role ? `Role: ${role}` : null }
    }
    case ACTIVITY_EVENT_TYPES.CALENDAR_EVENT_CREATED:
      return { actor, action: 'created calendar event', target: eventTitle || 'Untitled event', detail: null }
    case ACTIVITY_EVENT_TYPES.CALENDAR_EVENT_UPDATED:
      return { actor, action: 'updated calendar event', target: eventTitle || 'Untitled event', detail: null }
    default:
      return { actor, action: cfg.verb, target: getActivityEntityTitle(activity), detail: null }
  }
}

export function getActivityTarget(projectId, activity) {
  const md = activity?.metadata || {}
  const eventType = activity?.event_type
  if (!projectId) return null

  switch (eventType) {
    case ACTIVITY_EVENT_TYPES.TASK_CREATED:
    case ACTIVITY_EVENT_TYPES.TASK_COMPLETED:
    case ACTIVITY_EVENT_TYPES.TASK_REASSIGNED: {
      const taskId = md.task_id ?? activity?.entity_id
      return {
        to: taskId ? `/projects/${projectId}/tasks?taskId=${encodeURIComponent(taskId)}` : `/projects/${projectId}/tasks`,
        label: 'Open task',
      }
    }
    case ACTIVITY_EVENT_TYPES.DOCUMENT_CREATED:
    case ACTIVITY_EVENT_TYPES.DOCUMENT_UPDATED: {
      const documentId = md.document_id ?? activity?.entity_id
      return {
        to: `/projects/${projectId}/documents`,
        label: 'Open documents',
        state: documentId ? { focusDocumentId: documentId } : undefined,
      }
    }
    case ACTIVITY_EVENT_TYPES.MILESTONE_STEP_COMPLETED: {
      const milestoneId = md.milestone_id
      return {
        to: milestoneId
          ? `/projects/${projectId}/milestones?milestoneId=${encodeURIComponent(milestoneId)}`
          : `/projects/${projectId}/milestones`,
        label: 'Open milestone',
      }
    }
    case ACTIVITY_EVENT_TYPES.MEMBER_JOINED:
      return { to: `/projects/${projectId}/members`, label: 'Open members' }
    case ACTIVITY_EVENT_TYPES.CALENDAR_EVENT_CREATED:
    case ACTIVITY_EVENT_TYPES.CALENDAR_EVENT_UPDATED:
      return { to: `/projects/${projectId}/calendar`, label: 'Open calendar' }
    default:
      return null
  }
}
