import { useEffect, useState } from 'react'
import Modal from './Modal.jsx'
import RecurrenceFields from './RecurrenceFields.jsx'
import { buildRecurrenceRule, parseRecurrenceRule } from './recurrence.js'
import {
  getBrowserTimeZone,
  isoToWall,
  isValidTimeZone,
  nextDay,
  wallToIso,
} from './time.js'
import { createEvent, editOccurrence, updateEvent } from './api.js'

const EMPTY_RECURRENCE = {
  frequency: '',
  interval: 1,
  byDay: [],
  endMode: 'never',
  untilDate: '',
  count: '',
}

const SCOPES = [
  {
    value: 'occurrence',
    label: 'This occurrence',
    hint: 'Only the selected occurrence changes.',
  },
  {
    value: 'following',
    label: 'This and following',
    hint: 'Title, description, location and repeat rule only.',
  },
  {
    value: 'series',
    label: 'All occurrences',
    hint: 'Changes apply to the whole series.',
  },
]

/** Wall times are "YYYY-MM-DDTHH:mm"; the time part starts after the "T". */
function wallTimePart(wall) {
  const [, timePart = ''] = String(wall).split('T')
  return timePart.slice(0, 5)
}

function wallDatePart(wall) {
  return String(wall).split('T')[0] || ''
}

/**
 * A repeating occurrence ends at the end time on its own day; the series end
 * date lives in the repeat options ("Repeats ... until"). This clamps legacy
 * values whose end date is on a later day to the start's date, preserving the
 * end time of day.
 */
function sameDayEnd(startWall, endWall) {
  if (!startWall || !endWall) {
    return endWall
  }
  if (wallDatePart(endWall) === wallDatePart(startWall)) {
    return endWall
  }
  return `${wallDatePart(startWall)}T${wallTimePart(endWall)}`
}

function localWall(offsetHours) {
  const date = new Date(Date.now() + offsetHours * 60 * 60 * 1000)
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:00`
}

function localDate(offsetDays) {
  const date = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000)
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export default function EventDialog({
  open,
  mode = 'create',
  event = null,
  occurrence = null,
  calendarId,
  calendars = [],
  onClose,
  onSaved,
}) {
  const isEdit = mode === 'edit'
  const isRecurringEvent = isEdit && Boolean(event?.recurrence_rule)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [allDay, setAllDay] = useState(false)
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [timeZone, setTimeZone] = useState(getBrowserTimeZone())
  const [targetCalendarId, setTargetCalendarId] = useState(calendarId)
  const [recurrence, setRecurrence] = useState(EMPTY_RECURRENCE)
  // Only send a rule when the user actually edited it, so a rule the form
  // cannot express is never silently rewritten on save.
  const [recurrenceDirty, setRecurrenceDirty] = useState(false)
  const [scope, setScope] = useState('occurrence')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  useEffect(() => {
    if (!open) {
      return
    }

    setError('')
    setFieldErrors({})
    setSaving(false)
    setRecurrenceDirty(false)
    setTargetCalendarId(calendarId)

    if (isEdit && event) {
      setTitle(event.title || '')
      setDescription(event.description || '')
      setLocation(event.location || '')
      setAllDay(Boolean(event.is_all_day))
      const tz = event.timezone || getBrowserTimeZone()
      setTimeZone(tz)
      if (event.is_all_day) {
        setStartDate(event.start_date || '')
        setEndDate(event.end_date || '')
        setStartAt('')
        setEndAt('')
      } else {
        setStartAt(isoToWall(event.start_at, tz))
        setEndAt(
          event.recurrence_rule
            ? sameDayEnd(isoToWall(event.start_at, tz), isoToWall(event.end_at, tz))
            : isoToWall(event.end_at, tz),
        )
        setStartDate('')
        setEndDate('')
      }
      setRecurrence(parseRecurrenceRule(event.recurrence_rule))
      setScope(event.recurrence_rule ? 'occurrence' : 'series')
    } else {
      setTitle('')
      setDescription('')
      setLocation('')
      setAllDay(false)
      setStartAt(localWall(1))
      setEndAt(localWall(2))
      setStartDate(localDate(0))
      setEndDate(nextDay(localDate(0)))
      setTimeZone(getBrowserTimeZone())
      setRecurrence(EMPTY_RECURRENCE)
      setScope('occurrence')
    }
  }, [open, isEdit, event, calendarId])

  // For recurring events the time fields follow the chosen scope: the
  // occurrence's times for "this occurrence", the series' times otherwise.
  useEffect(() => {
    if (!open || !isRecurringEvent || !event) {
      return
    }
    if (scope === 'occurrence' && occurrence) {
      if (occurrence.isAllDay) {
        setStartDate(occurrence.startDate || event.start_date || '')
        setEndDate(occurrence.endDate || event.end_date || '')
      } else {
        const tz = event.timezone || getBrowserTimeZone()
        const occStart = occurrence.startAt ? isoToWall(occurrence.startAt, tz) : ''
        const occEnd = occurrence.endAt ? isoToWall(occurrence.endAt, tz) : ''
        setStartAt(occStart)
        setEndAt(sameDayEnd(occStart, occEnd))
      }
    } else if (scope === 'series' || scope === 'following') {
      if (event.is_all_day) {
        setStartDate(event.start_date || '')
        setEndDate(event.end_date || '')
      } else {
        const tz = event.timezone || getBrowserTimeZone()
        const seriesStart = isoToWall(event.start_at, tz)
        setStartAt(seriesStart)
        setEndAt(sameDayEnd(seriesStart, isoToWall(event.end_at, tz)))
      }
    }
  }, [scope, open, isRecurringEvent, event, occurrence])

  const datesDisabled = isRecurringEvent && scope === 'following'
  const detailsDisabled = isRecurringEvent && scope === 'occurrence'
  const timezoneDisabled =
    isEdit && (allDay || datesDisabled || detailsDisabled)
  const allDayToggleDisabled = isEdit

  const rule = buildRecurrenceRule({
    ...recurrence,
    isAllDay: allDay,
    timeZone,
  })

  // A repeating timed event's "Ends" field is the end *time* of a single
  // occurrence (on the occurrence's own day); the series end date is chosen
  // in the repeat options. Non-repeating events keep the full datetime field.
  const repeatingTimed = !allDay && Boolean(recurrence.frequency || event?.recurrence_rule)

  function effectiveEndWall() {
    return repeatingTimed ? sameDayEnd(startAt, endAt) : endAt
  }

  function validate() {
    const errors = {}
    if (!title.trim()) {
      errors.title = 'Please enter an event title.'
    } else if (title.trim().length > 255) {
      errors.title = 'Title must be 255 characters or fewer.'
    }

    if (!allDay && !timezoneDisabled && !isValidTimeZone(timeZone)) {
      errors.timeZone = 'Enter a valid IANA timezone, e.g. Europe/Berlin.'
    }

    if (!datesDisabled) {
      if (allDay) {
        if (!startDate || !endDate) {
          errors.dates = 'Start and end dates are required.'
        } else if (endDate <= startDate) {
          errors.dates = 'End date must be later than the start date.'
        }
      } else if (repeatingTimed) {
        if (!startAt || !wallTimePart(endAt)) {
          errors.dates = 'Start and end time are required.'
        } else if (wallTimePart(endAt) <= wallTimePart(startAt)) {
          errors.dates = 'End time must be later than the start time.'
        }
      } else if (!startAt || !endAt) {
        errors.dates = 'Start and end date/time are required.'
      } else if (endAt <= startAt) {
        errors.dates = 'End must be later than the start.'
      }
    }

    if (recurrence.frequency && !detailsDisabled) {
      if (
        recurrence.frequency === 'WEEKLY' &&
        recurrence.byDay.length === 0
      ) {
        errors.recurrence = 'Choose at least one weekday.'
      }
      if (recurrence.endMode === 'count' && !(Number(recurrence.count) > 0)) {
        errors.recurrence = 'Enter a positive occurrence count.'
      }
      if (recurrence.endMode === 'until' && !recurrence.untilDate) {
        errors.recurrence = 'Choose an end date for the recurrence.'
      }
    }

    return errors
  }

  function identifiers() {
    if (occurrence?.originalStartAt) {
      return { original_start_at: occurrence.originalStartAt }
    }
    return { original_start_date: occurrence?.originalStartDate ?? null }
  }

  function timeFieldsForUpdate() {
    if (event.is_all_day) {
      return { start_date: startDate, end_date: endDate }
    }
    return {
      start_at: wallToIso(startAt, timeZone),
      end_at: wallToIso(endAt, timeZone),
    }
  }

  async function submit(payloadBuilder) {
    setSaving(true)
    setError('')
    try {
      await payloadBuilder()
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err?.message || 'Could not save the event.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit(formEvent) {
    formEvent.preventDefault()
    const errors = validate()
    setFieldErrors(errors)
    setError('')
    if (Object.keys(errors).length > 0) {
      return
    }

    const base = {
      title: title.trim(),
      description: description.trim() ? description.trim() : null,
      location: location.trim() ? location.trim() : null,
    }

    if (!isEdit) {
      const targetId = targetCalendarId || calendarId
      const payload = allDay
        ? {
            ...base,
            is_all_day: true,
            start_date: startDate,
            end_date: endDate,
            recurrence_rule: rule,
          }
        : {
            ...base,
            is_all_day: false,
            start_at: wallToIso(startAt, timeZone),
            end_at: wallToIso(effectiveEndWall(), timeZone),
            timezone: timeZone,
            recurrence_rule: rule,
          }
      await submit(() => createEvent(targetId, payload))
      return
    }

    if (isRecurringEvent && scope === 'occurrence') {
      const payload = {
        ...identifiers(),
        scope: 'occurrence',
        title: base.title,
        description: base.description,
        ...(event.is_all_day
          ? { start_date: startDate, end_date: endDate }
          : {
              start_at: wallToIso(startAt, timeZone),
              end_at: wallToIso(effectiveEndWall(), timeZone),
            }),
      }
      await submit(() => editOccurrence(calendarId, event.id, payload))
      return
    }

    if (isRecurringEvent && scope === 'following') {
      const payload = {
        ...identifiers(),
        scope: 'following',
        title: base.title,
        description: base.description,
        location: base.location,
      }
      if (
        recurrenceDirty &&
        (rule ?? null) !== (event.recurrence_rule ?? null)
      ) {
        payload.recurrence_rule = rule
      }
      await submit(() => editOccurrence(calendarId, event.id, payload))
      return
    }

    const patch = { ...base }
    if (event.is_all_day) {
      if (startDate !== event.start_date) patch.start_date = startDate
      if (endDate !== event.end_date) patch.end_date = endDate
    } else {
      const startIso = wallToIso(startAt, timeZone)
      const endIso = wallToIso(effectiveEndWall(), timeZone)
      if (new Date(startIso).getTime() !== new Date(event.start_at).getTime()) {
        patch.start_at = startIso
      }
      if (new Date(endIso).getTime() !== new Date(event.end_at).getTime()) {
        patch.end_at = endIso
      }
      if (timeZone !== event.timezone) patch.timezone = timeZone
    }
    if (
      recurrenceDirty &&
      (rule ?? null) !== (event.recurrence_rule ?? null)
    ) {
      patch.recurrence_rule = rule
    }

    await submit(() => updateEvent(calendarId, event.id, patch))
  }

  return (
    <Modal
      open={open}
      wide
      title={isEdit ? 'Edit event' : 'New event'}
      onClose={saving ? () => {} : onClose}
      footer={
        <>
          <span className="dialog-footer-spacer" />
          <button
            type="button"
            className="button-secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="event-form"
            className="button-primary"
            disabled={saving}
          >
            {saving
              ? 'Saving…'
              : isEdit
                ? 'Save changes'
                : 'Create event'}
          </button>
        </>
      }
    >
      <form id="event-form" className="form" onSubmit={handleSubmit}>
        {error && (
          <div className="form-alert" role="alert">
            {error}
          </div>
        )}

        {isRecurringEvent && (
          <div className="form-section">
            <h3 className="form-section-title">Apply changes to</h3>
            <div className="scope-options">
              {SCOPES.map((option) => (
                <label
                  key={option.value}
                  className={`scope-option${scope === option.value ? ' is-active' : ''}`}
                >
                  <input
                    type="radio"
                    name="event-scope"
                    value={option.value}
                    checked={scope === option.value}
                    onChange={() => setScope(option.value)}
                  />
                  <span>
                    <span className="scope-option-label">{option.label}</span>
                    <span className="scope-option-hint">{option.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="form-field">
          <label className="form-label" htmlFor="event-title">
            Title
          </label>
          <input
            id="event-title"
            className={`form-input${fieldErrors.title ? ' form-input--invalid' : ''}`}
            value={title}
            maxLength={255}
            disabled={saving}
            autoFocus
            onChange={(event) => setTitle(event.target.value)}
          />
          {fieldErrors.title && (
            <p className="form-error">{fieldErrors.title}</p>
          )}
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="event-description">
            Description <span className="form-optional">(optional)</span>
          </label>
          <textarea
            id="event-description"
            className="form-textarea"
            rows={3}
            value={description}
            disabled={saving}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="event-location">
            Location <span className="form-optional">(optional)</span>
          </label>
          <input
            id="event-location"
            className="form-input"
            value={location}
            disabled={saving || detailsDisabled}
            onChange={(event) => setLocation(event.target.value)}
          />
          {detailsDisabled && (
            <p className="form-hint">
              A single occurrence can only change its title, description and
              time.
            </p>
          )}
        </div>

        {!isEdit && calendars.length > 1 && (
          <div className="form-field">
            <label className="form-label" htmlFor="event-calendar">
              Calendar
            </label>
            <select
              id="event-calendar"
              className="form-select"
              value={targetCalendarId ?? ''}
              disabled={saving}
              onChange={(event) =>
                setTargetCalendarId(Number(event.target.value))
              }
            >
              {calendars.map((calendar) => (
                <option key={calendar.id} value={calendar.id}>
                  {calendar.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="form-section">
          <h3 className="form-section-title">When</h3>

          <label className="form-checkbox">
            <input
              type="checkbox"
              checked={allDay}
              disabled={saving || allDayToggleDisabled}
              onChange={(event) => {
                const next = event.target.checked
                setAllDay(next)
                if (next) {
                  setStartDate(localDate(0))
                  setEndDate(nextDay(localDate(0)))
                } else {
                  setStartAt(localWall(1))
                  setEndAt(localWall(2))
                }
              }}
            />
            All-day event
          </label>
          {allDayToggleDisabled && (
            <p className="form-hint">
              An event's all-day setting cannot be changed after creation.
            </p>
          )}

          {allDay ? (
            <div className="form-row">
              <div className="form-field">
                <label className="form-label" htmlFor="event-start-date">
                  Start date
                </label>
                <input
                  id="event-start-date"
                  type="date"
                  className="form-input"
                  value={startDate}
                  disabled={saving || datesDisabled}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </div>
              <div className="form-field">
                <label className="form-label" htmlFor="event-end-date">
                  End date
                </label>
                <input
                  id="event-end-date"
                  type="date"
                  className="form-input"
                  value={endDate}
                  disabled={saving || datesDisabled}
                  onChange={(event) => setEndDate(event.target.value)}
                />
                <p className="form-hint">
                  End dates are exclusive: a one-day event ends the next day.
                </p>
              </div>
            </div>
          ) : (
            <div className="form-row">
              <div className="form-field">
                <label className="form-label" htmlFor="event-start">
                  Starts
                </label>
                <input
                  id="event-start"
                  type="datetime-local"
                  className="form-input"
                  value={startAt}
                  disabled={saving || datesDisabled}
                  onChange={(event) => setStartAt(event.target.value)}
                />
              </div>
              <div className="form-field">
                <label className="form-label" htmlFor="event-end">
                  {repeatingTimed ? 'Ends (each day)' : 'Ends'}
                </label>
                <input
                  id="event-end"
                  type={repeatingTimed ? 'time' : 'datetime-local'}
                  className="form-input"
                  value={repeatingTimed ? wallTimePart(endAt) : endAt}
                  disabled={saving || datesDisabled}
                  onChange={(event) => {
                    if (repeatingTimed) {
                      const value = event.target.value
                      setEndAt(
                        `${startAt ? wallDatePart(startAt) : ''}T${value}`.replace(/^T$/, ''),
                      )
                    } else {
                      setEndAt(event.target.value)
                    }
                  }}
                />
                {repeatingTimed && (
                  <p className="form-hint">
                    Each occurrence ends at this time on its own day. When the
                    series stops is set by the repeat options below.
                  </p>
                )}
              </div>
            </div>
          )}

          {fieldErrors.dates && (
            <p className="form-error">{fieldErrors.dates}</p>
          )}

          {!allDay && (
            <div className="form-field">
              <label className="form-label" htmlFor="event-timezone">
                Timezone
              </label>
              <input
                id="event-timezone"
                className={`form-input${fieldErrors.timeZone ? ' form-input--invalid' : ''}`}
                value={timeZone}
                disabled={saving || timezoneDisabled}
                onChange={(event) => setTimeZone(event.target.value)}
              />
              <p className="form-hint">
                IANA timezone used to interpret the times above.
              </p>
              {fieldErrors.timeZone && (
                <p className="form-error">{fieldErrors.timeZone}</p>
              )}
            </div>
          )}
        </div>

        <RecurrenceFields
          value={recurrence}
          onChange={(next) => {
            setRecurrence(next)
            setRecurrenceDirty(true)
          }}
          isAllDay={allDay}
          disabled={saving || detailsDisabled}
          error={fieldErrors.recurrence}
        />
      </form>
    </Modal>
  )
}
