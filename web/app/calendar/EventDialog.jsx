import { useEffect, useState } from 'react'
import DialogShell from '@/components/shared/DialogShell'
import FormError from '@/components/shared/FormError'
import {
  FieldMessage,
  fieldInputClass,
  fieldInvalidClass,
} from '@/components/shared/FormField'
import RadioOption from '@/components/shared/RadioOption'
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
import { CATEGORIES, DEFAULT_CATEGORY } from './categories.js'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

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

function FieldError({ id, children }) {
  return <FieldMessage id={id} error={children} />
}

function FieldHint({ id, children }) {
  return <FieldMessage id={id} hint={children} />
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
  const [category, setCategory] = useState(DEFAULT_CATEGORY)
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
      setCategory(event.category || DEFAULT_CATEGORY)
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
      setCategory(DEFAULT_CATEGORY)
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
            category,
          }
        : {
            ...base,
            is_all_day: false,
            start_at: wallToIso(startAt, timeZone),
            end_at: wallToIso(effectiveEndWall(), timeZone),
            timezone: timeZone,
            recurrence_rule: rule,
            category,
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
    if (category !== (event.category || DEFAULT_CATEGORY)) {
      patch.category = category
    }
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

  const selectedCategory =
    CATEGORIES.find((cat) => cat.id === category) ?? CATEGORIES[0]

  function handleAllDayChange(next) {
    setAllDay(next)
    if (next) {
      setStartDate(localDate(0))
      setEndDate(nextDay(localDate(0)))
    } else {
      setStartAt(localWall(1))
      setEndAt(localWall(2))
    }
  }

  return (
    <DialogShell
      open={open}
      wide
      title={isEdit ? 'Edit event' : 'New event'}
      onClose={saving ? () => {} : onClose}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            className="h-9"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="event-form"
            className="h-9"
            disabled={saving}
          >
            {saving
              ? 'Saving…'
              : isEdit
                ? 'Save changes'
                : 'Create event'}
          </Button>
        </>
      }
    >
      <form id="event-form" className="grid gap-5" onSubmit={handleSubmit}>
        <FormError>{error}</FormError>

        {isRecurringEvent && (
          <section className="grid gap-2">
            <h3 className="text-[13px] font-semibold">Apply changes to</h3>
            <div className="grid gap-2">
              {SCOPES.map((option) => (
                <RadioOption
                  key={option.value}
                  name="event-scope"
                  value={option.value}
                  title={option.label}
                  description={option.hint}
                  checked={scope === option.value}
                  onChange={() => setScope(option.value)}
                />
              ))}
            </div>
          </section>
        )}

        <div className="grid gap-2">
          <Label htmlFor="event-title" className="text-[13px] font-medium">
            Title <span className="text-destructive">*</span>
          </Label>
          <Input
            id="event-title"
            className={cn(fieldInputClass, fieldErrors.title && fieldInvalidClass)}
            value={title}
            maxLength={255}
            disabled={saving}
            autoFocus
            aria-invalid={fieldErrors.title ? true : undefined}
            aria-describedby={
              fieldErrors.title ? 'event-title-error' : undefined
            }
            onChange={(changeEvent) => setTitle(changeEvent.target.value)}
          />
          <FieldError id="event-title-error">{fieldErrors.title}</FieldError>
        </div>

        <div className="grid gap-2">
          <Label
            htmlFor="event-description"
            className="text-[13px] font-medium"
          >
            Description{' '}
            <span className="font-normal text-muted-foreground">
              (optional)
            </span>
          </Label>
          <Textarea
            id="event-description"
            className="min-h-[76px] rounded-[var(--radius-md)] px-3 py-2 text-base md:text-[15px]"
            rows={3}
            value={description}
            disabled={saving}
            onChange={(changeEvent) => setDescription(changeEvent.target.value)}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="event-location" className="text-[13px] font-medium">
            Location{' '}
            <span className="font-normal text-muted-foreground">
              (optional)
            </span>
          </Label>
          <Input
            id="event-location"
            className={fieldInputClass}
            value={location}
            disabled={saving || detailsDisabled}
            onChange={(changeEvent) => setLocation(changeEvent.target.value)}
          />
          {detailsDisabled && (
            <FieldHint>
              A single occurrence can only change its title, description and
              time.
            </FieldHint>
          )}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="event-category" className="text-[13px] font-medium">
            Category
          </Label>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-3.5 shrink-0 rounded-[3px]"
              style={{
                background: selectedCategory.background,
                border: `2px solid ${selectedCategory.accent}`,
              }}
            />
            <Select
              value={category}
              disabled={saving || detailsDisabled}
              onValueChange={setCategory}
            >
              <SelectTrigger id="event-category" className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {detailsDisabled && (
            <FieldHint>
              Category follows the series for a single occurrence.
            </FieldHint>
          )}
        </div>

        {!isEdit && calendars.length > 1 && (
          <div className="grid gap-2">
            <Label htmlFor="event-calendar" className="text-[13px] font-medium">
              Calendar
            </Label>
            <Select
              value={targetCalendarId ? String(targetCalendarId) : undefined}
              disabled={saving}
              onValueChange={(next) => setTargetCalendarId(Number(next))}
            >
              <SelectTrigger id="event-calendar">
                <SelectValue placeholder="Select calendar" />
              </SelectTrigger>
              <SelectContent>
                {calendars.map((calendar) => (
                  <SelectItem key={calendar.id} value={String(calendar.id)}>
                    {calendar.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <section className="grid gap-3">
          <h3 className="text-[13px] font-semibold">When</h3>

          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="event-all-day"
                checked={allDay}
                disabled={saving || allDayToggleDisabled}
                onCheckedChange={(next) => handleAllDayChange(next === true)}
              />
              <Label
                htmlFor="event-all-day"
                className="text-[13px] font-medium"
              >
                All-day event
              </Label>
            </div>
            {allDayToggleDisabled && (
              <FieldHint>
                An event's all-day setting cannot be changed after creation.
              </FieldHint>
            )}
          </div>

          {allDay ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label
                  htmlFor="event-start-date"
                  className="text-[13px] font-medium"
                >
                  Start date
                </Label>
                <Input
                  id="event-start-date"
                  type="date"
                  className={fieldInputClass}
                  value={startDate}
                  disabled={saving || datesDisabled}
                  onChange={(changeEvent) => setStartDate(changeEvent.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label
                  htmlFor="event-end-date"
                  className="text-[13px] font-medium"
                >
                  End date
                </Label>
                <Input
                  id="event-end-date"
                  type="date"
                  className={fieldInputClass}
                  value={endDate}
                  disabled={saving || datesDisabled}
                  onChange={(changeEvent) => setEndDate(changeEvent.target.value)}
                />
                <FieldHint>
                  End dates are exclusive: a one-day event ends the next day.
                </FieldHint>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="event-start" className="text-[13px] font-medium">
                  Starts
                </Label>
                <Input
                  id="event-start"
                  type="datetime-local"
                  className={fieldInputClass}
                  value={startAt}
                  disabled={saving || datesDisabled}
                  onChange={(changeEvent) => setStartAt(changeEvent.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="event-end" className="text-[13px] font-medium">
                  {repeatingTimed ? 'Ends (each day)' : 'Ends'}
                </Label>
                <Input
                  id="event-end"
                  type={repeatingTimed ? 'time' : 'datetime-local'}
                  className={fieldInputClass}
                  value={repeatingTimed ? wallTimePart(endAt) : endAt}
                  disabled={saving || datesDisabled}
                  onChange={(changeEvent) => {
                    if (repeatingTimed) {
                      const value = changeEvent.target.value
                      setEndAt(
                        `${startAt ? wallDatePart(startAt) : ''}T${value}`.replace(/^T$/, ''),
                      )
                    } else {
                      setEndAt(changeEvent.target.value)
                    }
                  }}
                />
                {repeatingTimed && (
                  <FieldHint>
                    Each occurrence ends at this time on its own day. When the
                    series stops is set by the repeat options below.
                  </FieldHint>
                )}
              </div>
            </div>
          )}

          <FieldError>{fieldErrors.dates}</FieldError>

          {!allDay && (
            <div className="grid gap-2">
              <Label
                htmlFor="event-timezone"
                className="text-[13px] font-medium"
              >
                Timezone
              </Label>
              <Input
                id="event-timezone"
                className={cn(fieldInputClass, fieldErrors.timeZone && fieldInvalidClass)}
                value={timeZone}
                disabled={saving || timezoneDisabled}
                aria-invalid={fieldErrors.timeZone ? true : undefined}
                aria-describedby={
                  fieldErrors.timeZone
                    ? 'event-timezone-error'
                    : 'event-timezone-hint'
                }
                onChange={(changeEvent) => setTimeZone(changeEvent.target.value)}
              />
              <FieldHint id="event-timezone-hint">
                IANA timezone used to interpret the times above.
              </FieldHint>
              <FieldError id="event-timezone-error">
                {fieldErrors.timeZone}
              </FieldError>
            </div>
          )}
        </section>

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
    </DialogShell>
  )
}
