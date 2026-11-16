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
import { categoryOf, categoryLabel, categoryStyleVars } from './categories.js'

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
    <div className="event-detail-row">
      <dt className="event-detail-label">
        <Icon size={14} aria-hidden="true" />
        {label}
      </dt>
      <dd className="event-detail-value">{children}</dd>
    </div>
  )
}

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

  useEffect(() => {
    function handleKeyDown(event) {
      if (
        event.key === 'Escape' &&
        !document.querySelector('.dialog-backdrop')
      ) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

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
    <aside
      className="event-detail"
      role="dialog"
      aria-labelledby="event-detail-title"
    >
      <header className="event-detail-header">
        <span className="event-detail-eyebrow">Event</span>
        <button
          type="button"
          className="icon-button icon-button--small"
          onClick={onClose}
          aria-label="Close event details"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      <div className="event-detail-content">
        <h2 className="event-detail-title" id="event-detail-title">
          {title}
        </h2>

        <div className="event-detail-badges">
          {occurrence.isAllDay && (
            <span className="event-detail-badge">All day</span>
          )}
          {occurrence.isRecurring && (
            <span className="event-detail-badge event-detail-badge--muted">
              Repeating
            </span>
          )}
          {occurrence.isException && (
            <span className="event-detail-badge event-detail-badge--muted">
              Modified
            </span>
          )}
          <span
            className="event-detail-badge event-detail-badge--category"
            style={categoryStyleVars(occurrence.category)}
          >
            {categoryLabel(occurrence.category)}
          </span>
        </div>

        {details.loading && !event ? (
          <p className="event-detail-note">Loading event…</p>
        ) : details.error ? (
          <div className="event-detail-note" role="alert">
            <p>{details.error}</p>
            <button
              type="button"
              className="link-button"
              onClick={details.reload}
            >
              Retry
            </button>
          </div>
        ) : (
          <dl className="event-detail-list">
            {when && (
              <DetailRow icon={Clock} label="When">
                <p>{when}</p>
                {timezone && <p className="event-detail-sub">{timezone}</p>}
              </DetailRow>
            )}

            {event?.location && (
              <DetailRow icon={MapPin} label="Location">
                {event.location}
              </DetailRow>
            )}

            {calendar?.name && (
              <DetailRow icon={Calendar} label="Calendar">
                <span className="event-detail-calendar">
                  {calendar.color && (
                    <span
                      className="event-detail-calendar-dot"
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
                <p className="event-detail-sub">No reminders.</p>
              ) : (
                <ul className="reminder-list">
                  {details.reminders.map((reminder) => (
                    <li className="reminder-row" key={reminder.id}>
                      <select
                        className="reminder-select"
                        value={reminder.minutes_before}
                        disabled={details.busy}
                        aria-label={`Reminder timing: ${reminderLabel(reminder.minutes_before)}`}
                        onChange={(changeEvent) =>
                          details.changeReminder(
                            reminder.id,
                            Number(changeEvent.target.value),
                          )
                        }
                      >
                        {reminderOptions.map((minutes) => (
                          <option key={minutes} value={minutes}>
                            {reminderLabel(minutes)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="icon-button icon-button--tiny"
                        onClick={() => details.removeReminder(reminder.id)}
                        disabled={details.busy}
                        aria-label={`Delete reminder ${reminderLabel(reminder.minutes_before)}`}
                      >
                        <Trash2 size={13} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="reminder-add">
                <select
                  className="reminder-select"
                  value={newReminder}
                  disabled={details.busy}
                  aria-label="New reminder timing"
                  onChange={(changeEvent) =>
                    setNewReminder(Number(changeEvent.target.value))
                  }
                >
                  {REMINDER_PRESETS.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {reminderLabel(minutes)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => details.addReminder(newReminder)}
                  disabled={details.busy}
                >
                  <Plus size={13} aria-hidden="true" />
                  Add
                </button>
              </div>

              {details.remindersError && (
                <p className="form-error" role="alert">
                  {details.remindersError}
                </p>
              )}
            </DetailRow>
          </dl>
        )}

        <section className="detail-section" aria-labelledby="comments-title">
          <div className="detail-section-header">
            <h3 className="detail-section-title" id="comments-title">
              Comments
            </h3>
            <span className="detail-section-count">{details.comments.length}</span>
          </div>

          {details.comments.length === 0 && !details.commentsBusy ? (
            <p className="event-detail-sub">No comments yet.</p>
          ) : (
            <ul className="comment-list">
              {details.comments.map((comment) => (
                <li className="comment-item" key={comment.id}>
                  <p className="comment-content">{comment.content}</p>
                  <div className="comment-meta">
                    <time dateTime={comment.created_at}>
                      {formatDateTime(comment.created_at)}
                    </time>
                    <button
                      type="button"
                      className="icon-button icon-button--tiny"
                      onClick={() => details.removeComment(comment.id)}
                      disabled={details.commentsBusy}
                      aria-label="Delete comment"
                    >
                      <Trash2 size={13} aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {details.commentsError && (
            <p className="form-error" role="alert">
              {details.commentsError}
            </p>
          )}

          <form className="comment-form" onSubmit={handleAddComment}>
            <textarea
              className="form-textarea"
              rows={2}
              value={commentDraft}
              maxLength={5000}
              placeholder="Add a comment…"
              disabled={details.commentsBusy}
              onChange={(changeEvent) => setCommentDraft(changeEvent.target.value)}
            />
            <button
              type="submit"
              className="button-secondary"
              disabled={details.commentsBusy || !commentDraft.trim()}
            >
              {details.commentsBusy ? 'Saving…' : 'Comment'}
            </button>
          </form>
        </section>
      </div>

      <footer className="event-detail-actions">
        <button
          type="button"
          className="button-secondary"
          onClick={() => onEdit?.(event, occurrence)}
          disabled={!canEdit}
        >
          <Pencil size={14} aria-hidden="true" />
          Edit
        </button>
        <button
          type="button"
          className="button-danger-ghost"
          onClick={() => onDelete?.(event, occurrence)}
          disabled={!canEdit}
        >
          <Trash2 size={14} aria-hidden="true" />
          Delete
        </button>
      </footer>
    </aside>
  )
}
