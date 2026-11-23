import { useEffect, useState } from 'react'
import {
  Bell,
  Calendar,
  Clock,
  FileText,
  Layers,
  MapPin,
  Pencil,
  Plus,
  Repeat,
  Trash2,
  X,
} from 'lucide-react'
import useEventDetails from './useEventDetails.js'
import { attachEventToWorkspace, detachEventFromWorkspace } from './api.js'
import { describeRecurrence } from './recurrence.js'
import { formatEventWhen, formatReminder } from './eventDetail.js'
import { parseDateOnly } from './time.js'
import { categoryOf } from './categories.js'
import WorkspaceBadges from '../workspace/components/WorkspaceBadges.jsx'
import { useActiveWorkspace } from '../workspace/ActiveWorkspaceContext.jsx'
import ErrorState from '@/components/shared/ErrorState'
import { FieldMessage } from '@/components/shared/FormField'
import IconButton from '@/components/shared/IconButton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'

const REMINDER_PRESETS = [0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080]

function reminderLabel(minutes) {
  return formatReminder(minutes)
}

function whenFor(occurrence, timeZone) {
  if (!occurrence) {
    return ''
  }
  if (occurrence.isAllDay) {
    return formatEventWhen({
      start: parseDateOnly(occurrence.startDate),
      end: occurrence.endDate ? parseDateOnly(occurrence.endDate) : null,
      isAllDay: true,
    })
  }
  return formatEventWhen({
    start: new Date(occurrence.startAt),
    end: occurrence.endAt ? new Date(occurrence.endAt) : null,
    isAllDay: false,
    timeZone,
  })
}

function formatDateTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function DetailRow({ icon: Icon, label, children }) {
  return (
    <div className="grid gap-1">
      <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
        <Icon size={13} aria-hidden="true" />
        {label}
      </dt>
      <dd className="text-[13px] text-foreground">{children}</dd>
    </div>
  )
}

/**
 * Event details as a shadcn Sheet: the event's own fields, reminders and
 * comments, with edit/delete in a fixed footer. Selection, detail fetching and
 * reminder/comment mutations are the same hooks as before.
 */
const MANAGE_ROLES = new Set(['owner', 'admin', 'editor'])

export default function EventDetailPanel({
  occurrence,
  calendar,
  refreshKey = 0,
  readOnly = false,
  onClose,
  onEdit,
  onDelete,
  onUnauthorized,
  onWorkspaceChanged,
}) {
  const resolvedCalendarId = calendar?.id ?? occurrence?.calendarId ?? occurrence?.calendar_id ?? null
  const details = useEventDetails({
    calendarId: resolvedCalendarId,
    occurrence,
    refreshKey,
    onUnauthorized,
  })
  const { workspaces: accessibleWorkspaces } = useActiveWorkspace()

  const [newReminder, setNewReminder] = useState(15)
  const [commentDraft, setCommentDraft] = useState('')
  const [workspaceBusyId, setWorkspaceBusyId] = useState(null)
  const [workspaceError, setWorkspaceError] = useState('')
  const [eventWorkspaces, setEventWorkspaces] = useState([])

  useEffect(() => {
    setCommentDraft('')
    setNewReminder(15)
    setWorkspaceError('')
    setWorkspaceBusyId(null)
  }, [occurrence?.eventId, occurrence?.originalStartAt, occurrence?.originalStartDate])

  useEffect(() => {
    const fromOccurrence = Array.isArray(occurrence?.workspaces) ? occurrence.workspaces : []
    const fromEvent = Array.isArray(details.event?.workspaces) ? details.event.workspaces : []
    setEventWorkspaces(fromEvent.length > 0 ? fromEvent : fromOccurrence)
  }, [occurrence?.workspaces, details.event?.workspaces, occurrence?.eventId])

  if (!occurrence) {
    return null
  }

  const event = details.event
  const title = occurrence.isException
    ? occurrence.title
    : event?.title || occurrence.title
  const description = occurrence.isException
    ? occurrence.description
    : event?.description || occurrence.description
  const timezone = event?.timezone || occurrence.timezone
  const recurrence = describeRecurrence(event?.recurrence_rule)
  const when = whenFor(occurrence, timezone)
  const canEdit = Boolean(event) && !readOnly
  const category = categoryOf(occurrence.category)

  const reminderOptions = Array.from(
    new Set([...REMINDER_PRESETS, ...details.reminders.map((r) => r.minutes_before)]),
  ).sort((a, b) => a - b)

  const workspaceRoleById = new Map(
    (Array.isArray(accessibleWorkspaces) ? accessibleWorkspaces : []).map((w) => [w.id, w.current_user_role]),
  )
  const canManageWorkspace = (workspaceId) => MANAGE_ROLES.has(workspaceRoleById.get(workspaceId))
  const eventWorkspaceIds = new Set(eventWorkspaces.map((w) => w.id))
  const attachableWorkspaces = (Array.isArray(accessibleWorkspaces) ? accessibleWorkspaces : [])
    .filter((w) => canManageWorkspace(w.id) && !eventWorkspaceIds.has(w.id))

  async function handleAttachWorkspace(workspaceId) {
    if (!resolvedCalendarId || !occurrence?.eventId || !workspaceId || workspaceBusyId) return
    setWorkspaceBusyId(workspaceId)
    setWorkspaceError('')
    try {
      await attachEventToWorkspace(resolvedCalendarId, occurrence.eventId, workspaceId)
      const ws = (Array.isArray(accessibleWorkspaces) ? accessibleWorkspaces : []).find((w) => w.id === workspaceId)
      if (ws) {
        const attached = { id: ws.id, name: ws.name, workspace_type: ws.workspace_type }
        setEventWorkspaces((prev) => (prev.some((p) => p.id === ws.id) ? prev : [...prev, attached]))
        onWorkspaceChanged?.({ attachedWorkspace: attached })
      } else {
        onWorkspaceChanged?.()
      }
    } catch (err) {
      if (err?.status === 401) {
        onUnauthorized?.()
        return
      }
      setWorkspaceError(err?.message || 'Could not add the event to the workspace.')
    } finally {
      setWorkspaceBusyId(null)
    }
  }

  async function handleDetachWorkspace(workspaceId) {
    if (!resolvedCalendarId || !occurrence?.eventId || !workspaceId || workspaceBusyId) return
    if (eventWorkspaces.length <= 1) return
    setWorkspaceBusyId(workspaceId)
    setWorkspaceError('')
    try {
      await detachEventFromWorkspace(resolvedCalendarId, occurrence.eventId, workspaceId)
      setEventWorkspaces((prev) => prev.filter((w) => w.id !== workspaceId))
      onWorkspaceChanged?.({ detachedWorkspaceId: workspaceId })
    } catch (err) {
      if (err?.status === 401) {
        onUnauthorized?.()
        return
      }
      setWorkspaceError(err?.message || 'Could not remove the event from the workspace.')
    } finally {
      setWorkspaceBusyId(null)
    }
  }

  async function handleAddComment(formEvent) {
    formEvent.preventDefault()
    const content = commentDraft.trim()
    if (!content) {
      return
    }
    const ok = await details.addComment(content)
    if (ok) {
      setCommentDraft('')
    }
  }

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) {
          onClose()
        }
      }}
    >
      <SheetContent
        side="right"
        className="cal-sheet flex w-full flex-col gap-0 border-l border-border p-0 sm:max-w-[420px] [&>button]:hidden"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Event
          </span>
          <IconButton label="Close event details" onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </IconButton>
        </div>

        <ScrollArea className="flex-1">
          <div className="grid gap-5 px-5 py-4">
            <div className="grid gap-2">
              <SheetTitle className="text-lg font-semibold leading-snug tracking-[-0.01em]">
                {title}
              </SheetTitle>
              <SheetDescription className="sr-only">
                Event details
              </SheetDescription>

              <div className="flex flex-wrap gap-1.5">
                {occurrence.isAllDay && (
                  <Badge variant="secondary" className="font-medium">
                    All day
                  </Badge>
                )}
                {occurrence.isRecurring && (
                  <Badge variant="secondary" className="font-medium">
                    Repeating
                  </Badge>
                )}
                {occurrence.isException && (
                  <Badge variant="secondary" className="font-medium">
                    Modified
                  </Badge>
                )}
                <Badge
                  variant="outline"
                  className="border font-medium"
                  style={{
                    background: category.background,
                    borderColor: category.accent,
                    color: category.text,
                  }}
                >
                  {category.label}
                </Badge>
              </div>
            </div>

            {details.loading && !event ? (
              <div className="grid gap-2" aria-hidden="true">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3.5 w-48" />
                <Skeleton className="h-3.5 w-40" />
              </div>
            ) : details.error ? (
              <ErrorState message={details.error} onRetry={details.reload} />
            ) : (
              <dl className="grid gap-4">
                {when && (
                  <DetailRow icon={Clock} label="When">
                    <p>{when}</p>
                    {timezone && (
                      <p className="text-[12px] text-muted-foreground">
                        {timezone}
                      </p>
                    )}
                  </DetailRow>
                )}

                {event?.location && (
                  <DetailRow icon={MapPin} label="Location">
                    {event.location}
                  </DetailRow>
                )}

                {(calendar?.name || resolvedCalendarId) && (
                  <DetailRow icon={Calendar} label="Calendar">
                    <span className="flex items-center gap-1.5">
                      {calendar?.color && (
                        <span
                          className="size-2.5 shrink-0 rounded-full border border-black/10"
                          style={{ background: calendar.color }}
                          aria-hidden="true"
                        />
                      )}
                      {calendar?.name || `Calendar #${resolvedCalendarId}`}
                    </span>
                  </DetailRow>
                )}

                <DetailRow icon={Layers} label="Workspaces">
                  <div className="grid gap-2">
                    {eventWorkspaces.length === 0 ? (
                      <p className="text-[12px] text-muted-foreground">No workspace associations.</p>
                    ) : (
                      <ul className="grid gap-1.5">
                        {eventWorkspaces.map((ws) => {
                          const canDetach = !readOnly && canManageWorkspace(ws.id)
                          const isLast = eventWorkspaces.length <= 1
                          const busy = workspaceBusyId === ws.id
                          return (
                            <li key={ws.id} className="flex items-center gap-2">
                              <span className="min-w-0 flex-1 truncate text-[13px]">{ws.name}</span>
                              {ws.workspace_type === 'personal' && (
                                <Badge variant="outline" className="px-1.5 py-0 text-[10px]">Personal</Badge>
                              )}
                              {canDetach && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-[12px] text-muted-foreground hover:text-destructive"
                                  disabled={busy || isLast || workspaceBusyId != null}
                                  title={isLast ? 'Cannot remove the last workspace association' : `Remove from ${ws.name}`}
                                  onClick={() => handleDetachWorkspace(ws.id)}
                                >
                                  {busy ? 'Removing…' : 'Remove'}
                                </Button>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    )}

                    {!readOnly && eventWorkspaces.length <= 1 && eventWorkspaces.length > 0 && (
                      <p className="text-[11px] text-muted-foreground">The last workspace association cannot be removed.</p>
                    )}

                    {!readOnly && attachableWorkspaces.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Select
                          value=""
                          onValueChange={(value) => {
                            const id = Number(value)
                            if (Number.isFinite(id)) handleAttachWorkspace(id)
                          }}
                          disabled={workspaceBusyId != null}
                        >
                          <SelectTrigger className="h-8 flex-1 text-[12.5px]" aria-label="Add event to workspace">
                            <SelectValue placeholder="Add to workspace…" />
                          </SelectTrigger>
                          <SelectContent>
                            {attachableWorkspaces.map((ws) => (
                              <SelectItem key={ws.id} value={String(ws.id)}>
                                {ws.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <FieldMessage error={workspaceError} />
                  </div>
                </DetailRow>

                {description && (
                  <DetailRow icon={FileText} label="Description">
                    {description}
                  </DetailRow>
                )}

                {recurrence && (
                  <DetailRow icon={Repeat} label="Repeats">
                    <span title={event?.recurrence_rule || ''}>{recurrence}</span>
                  </DetailRow>
                )}

                <DetailRow icon={Bell} label="Reminders">
                  {details.reminders.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground">
                      No reminders.
                    </p>
                  ) : (
                    <ul className="grid gap-2">
                      {details.reminders.map((reminder) => (
                        <li className="flex items-center gap-2" key={reminder.id}>
                          {readOnly ? (
                            <span className="text-[13px] text-foreground">{reminderLabel(reminder.minutes_before)}</span>
                          ) : (
                            <>
                              <Select
                                value={String(reminder.minutes_before)}
                                disabled={details.busy}
                                onValueChange={(next) =>
                                  details.changeReminder(
                                    reminder.id,
                                    Number(next),
                                  )
                                }
                              >
                                <SelectTrigger
                                  className="h-8 flex-1 text-[12.5px]"
                                  aria-label={`Reminder timing: ${reminderLabel(reminder.minutes_before)}`}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {reminderOptions.map((minutes) => (
                                    <SelectItem key={minutes} value={String(minutes)}>
                                      {reminderLabel(minutes)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <IconButton
                                label={`Delete reminder ${reminderLabel(reminder.minutes_before)}`}
                                className="hover:text-destructive"
                                onClick={() => details.removeReminder(reminder.id)}
                                disabled={details.busy}
                              >
                                <Trash2 size={13} aria-hidden="true" />
                              </IconButton>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  {!readOnly && (
                    <div className="mt-2 flex items-center gap-2">
                      <Select
                        value={String(newReminder)}
                        disabled={details.busy}
                        onValueChange={(next) => setNewReminder(Number(next))}
                      >
                        <SelectTrigger
                          className="h-8 flex-1 text-[12.5px]"
                          aria-label="New reminder timing"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {REMINDER_PRESETS.map((minutes) => (
                            <SelectItem key={minutes} value={String(minutes)}>
                              {reminderLabel(minutes)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1"
                        onClick={() => details.addReminder(newReminder)}
                        disabled={details.busy}
                      >
                        <Plus size={13} aria-hidden="true" />
                        Add
                      </Button>
                    </div>
                  )}

                  <FieldMessage error={details.remindersError} />
                </DetailRow>
              </dl>
            )}

            <section className="grid gap-3" aria-labelledby="comments-title">
              <div className="flex items-center gap-2">
                <h3
                  id="comments-title"
                  className="text-[13px] font-semibold"
                >
                  Comments
                </h3>
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-medium">
                  {details.comments.length}
                </Badge>
              </div>

              {details.comments.length === 0 && !details.commentsBusy ? (
                <p className="text-[12px] text-muted-foreground">
                  No comments yet.
                </p>
              ) : (
                <ul className="grid gap-3">
                  {details.comments.map((comment) => (
                    <li
                      key={comment.id}
                      className="rounded-[var(--radius-md)] border border-border bg-card px-3 py-2"
                    >
                      <p className="whitespace-pre-wrap text-[13px]">
                        {comment.content}
                      </p>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <time
                          className="text-[11px] text-muted-foreground"
                          dateTime={comment.created_at}
                        >
                          {formatDateTime(comment.created_at)}
                        </time>
                        {!readOnly && (
                          <IconButton
                            label="Delete comment"
                            className="size-6 hover:text-destructive"
                            onClick={() => details.removeComment(comment.id)}
                            disabled={details.commentsBusy}
                          >
                            <Trash2 size={12} aria-hidden="true" />
                          </IconButton>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <FieldMessage error={details.commentsError} />

              {!readOnly ? (
                <form className="grid gap-2" onSubmit={handleAddComment}>
                  <Textarea
                    className="min-h-[60px] rounded-[var(--radius-md)] px-3 py-2 text-base md:text-[15px]"
                    rows={2}
                    value={commentDraft}
                    maxLength={5000}
                    placeholder="Add a comment…"
                    disabled={details.commentsBusy}
                    onChange={(changeEvent) => setCommentDraft(changeEvent.target.value)}
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    className="h-8 w-fit"
                    disabled={details.commentsBusy || !commentDraft.trim()}
                  >
                    {details.commentsBusy ? 'Saving…' : 'Comment'}
                  </Button>
                </form>
              ) : (
                <p className="text-[12px] text-muted-foreground">View-only access. Comment actions are not available for your role.</p>
              )}
            </section>
          </div>
        </ScrollArea>

        <div className="flex items-center gap-2 border-t border-border px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
          {!readOnly ? (
            <>
              <Button
                type="button"
                variant="outline"
                className="h-9 flex-1 gap-1.5"
                onClick={() => onEdit?.(event, occurrence)}
                disabled={!canEdit}
              >
                <Pencil size={14} aria-hidden="true" />
                Edit
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-9 flex-1 gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => onDelete?.(event, occurrence)}
                disabled={!canEdit}
                title="Permanently delete this event"
              >
                <Trash2 size={14} aria-hidden="true" />
                Delete everywhere
              </Button>
            </>
          ) : (
            <p className="w-full text-center text-[12.5px] text-muted-foreground">View-only access. Event management actions are not available for your role.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
