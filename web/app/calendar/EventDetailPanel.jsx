import { useEffect, useState } from 'react'
import {
  Bell,
  Calendar,
  Clock,
  FileText,
  MapPin,
  Pencil,
  Plus,
  Repeat,
  Trash2,
  X,
} from 'lucide-react'
import useEventDetails from './useEventDetails.js'
import { describeRecurrence } from './recurrence.js'
import { formatEventWhen, formatReminder } from './eventDetail.js'
import { parseDateOnly } from './time.js'
import { categoryOf } from './categories.js'
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
export default function EventDetailPanel({
  occurrence,
  calendar,
  refreshKey = 0,
  onClose,
  onEdit,
  onDelete,
  onUnauthorized,
}) {
  const details = useEventDetails({
    calendarId: calendar?.id,
    occurrence,
    refreshKey,
    onUnauthorized,
  })

  const [newReminder, setNewReminder] = useState(15)
  const [commentDraft, setCommentDraft] = useState('')

  useEffect(() => {
    setCommentDraft('')
    setNewReminder(15)
  }, [occurrence?.eventId, occurrence?.originalStartAt, occurrence?.originalStartDate])

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
  const canEdit = Boolean(event)
  const category = categoryOf(occurrence.category)

  const reminderOptions = Array.from(
    new Set([...REMINDER_PRESETS, ...details.reminders.map((r) => r.minutes_before)]),
  ).sort((a, b) => a - b)

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
        className="flex w-full flex-col gap-0 border-l border-border p-0 sm:max-w-[420px] [&>button]:hidden"
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

                {calendar?.name && (
                  <DetailRow icon={Calendar} label="Calendar">
                    <span className="flex items-center gap-1.5">
                      {calendar.color && (
                        <span
                          className="size-2.5 shrink-0 rounded-full border border-black/10"
                          style={{ background: calendar.color }}
                          aria-hidden="true"
                        />
                      )}
                      {calendar.name}
                    </span>
                  </DetailRow>
                )}

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
                        </li>
                      ))}
                    </ul>
                  )}

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
                        <IconButton
                          label="Delete comment"
                          className="size-6 hover:text-destructive"
                          onClick={() => details.removeComment(comment.id)}
                          disabled={details.commentsBusy}
                        >
                          <Trash2 size={12} aria-hidden="true" />
                        </IconButton>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <FieldMessage error={details.commentsError} />

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
            </section>
          </div>
        </ScrollArea>

        <div className="flex items-center gap-2 border-t border-border px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
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
          >
            <Trash2 size={14} aria-hidden="true" />
            Delete
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
