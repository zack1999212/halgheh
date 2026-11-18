import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import LoadingState from '@/components/shared/LoadingState'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import RadioOption from '@/components/shared/RadioOption'
import { Button } from '@/components/ui/button'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import CalendarToolbar from './CalendarToolbar.jsx'
import CalendarEvent from './CalendarEvent.jsx'
import EventDetailPanel from './EventDetailPanel.jsx'
import EventDialog from './EventDialog.jsx'
import CalendarDialog from './CalendarDialog.jsx'
import useCalendars from './useCalendars.js'
import useCalendarEvents, { occurrenceToSelection } from './useCalendarEvents.js'
import { createException, deleteEvent, editOccurrence, updateEvent } from './api.js'
import { getBrowserTimeZone } from './time.js'
import { clearToken } from '../src/api.js'
import { CALENDAR_VIEWS, DEFAULT_VIEW, fcViewType } from './views.js'
import { categoryOf } from './categories.js'
import CalendarAgent from './agent/CalendarAgent.jsx'
import { createTimeGridGuides } from './timeGridGuides.js'
import './calendar.css'

/**
 * Centered overlay for the calendar's loading, error and empty states.
 * ``passthrough`` drops the wash and lets pointer events reach the grid, so an
 * informational state never prevents selecting a time slot.
 */
function CalendarOverlay({ children, passthrough = false }) {
  const classes = [
    'absolute inset-0 z-10 flex items-center justify-center p-4',
    passthrough ? 'pointer-events-none' : 'bg-card/70',
  ].join(' ')
  return (
    <div className={classes}>
      <div className="w-full max-w-[320px] rounded-[var(--radius-lg)] border border-border bg-card p-5 text-center shadow-sm">
        {children}
      </div>
    </div>
  )
}

const SCROLL_TIME = '08:00:00'

export default function CalendarPage() {
  const calendarRef = useRef(null)
  const surfaceRef = useRef(null)
  const guidesRef = useRef(null)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const requestedView = searchParams.get('view')
  const requestedDate = searchParams.get('date')
  const initialView =
    CALENDAR_VIEWS.some((v) => v.id === requestedView) ? requestedView : DEFAULT_VIEW

  const [view, setView] = useState(initialView)

  // A view switch keeps the previous view's scroll offset, which can leave the
  // day's events off-screen. Align the new view to the same start hour a fresh
  // view shows, using the mounted slots: the API's scrollToTime still measures
  // with the previous view's slot height (Day slots are taller than Week's).
  useEffect(() => {
    // A view switch keeps the previous view's scroll offset, which can leave
    // the day's events off-screen. Align the new view to SCROLL_TIME using
    // the slot that actually rendered for that time, so the offset is measured
    // against this view's (not the previous view's) slot height.
    let outer, inner
    outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        const root = surfaceRef.current
        const scroller = root?.querySelector('.fc-scroller-liquid-absolute')
        const slot = root?.querySelector(
          `.fc-timegrid-slot-lane[data-time="${SCROLL_TIME}"]`
        )
        if (!scroller || !slot) {
          return
        }
        scroller.scrollTop = slot.offsetTop
      })
    })
    return () => {
      cancelAnimationFrame(outer)
      if (inner) cancelAnimationFrame(inner)
    }
  }, [view])

  const [rangeLabel, setRangeLabel] = useState('')
  const [selectedOccurrence, setSelectedOccurrence] = useState(null)
  const [detailsRefreshKey, setDetailsRefreshKey] = useState(0)
  const [editor, setEditor] = useState({ open: false, mode: 'create' })
  const [calendarDialog, setCalendarDialog] = useState({
    open: false,
    calendar: null,
  })
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteScope, setDeleteScope] = useState('series')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [dragScopeTarget, setDragScopeTarget] = useState(null)
  const [dragScope, setDragScope] = useState('occurrence')
  const [dragBusy, setDragBusy] = useState(false)
  const [dragError, setDragError] = useState('')

  const handleUnauthorized = useCallback(() => {
    clearToken()
    navigate('/login', { replace: true })
  }, [navigate])

  const calendarsApi = useCalendars({ onUnauthorized: handleUnauthorized })

  // Guide lines for the Week/Day time grids: faint hairlines connecting each
  // timed event's start and end edges to the hour axis. The guides module
  // watches the surface for FullCalendar's own DOM mutations (event drag and
  // resize rewrite inline styles), so the lines follow those gestures live.
  useEffect(() => {
    const surface = surfaceRef.current
    if (!surface) {
      return undefined
    }
    const guides = createTimeGridGuides(surface)
    guidesRef.current = guides
    return () => {
      guides.destroy()
      guidesRef.current = null
    }
  }, [])

  const {
    calendars,
    selectedCalendarId,
    selectedCalendar,
    loading: calendarsLoading,
    error: calendarsError,
  } = calendarsApi

  const eventsApi = useCalendarEvents({
    calendarId: selectedCalendarId,
    calendar: selectedCalendar,
    onUnauthorized: handleUnauthorized,
  })

  // The assistant can change events in any calendar; refresh the current grid
  // and the open detail panel without resetting the selected date or view.
  const reloadEvents = eventsApi.reload
  const handleAgentCalendarChange = useCallback(() => {
    reloadEvents()
    setDetailsRefreshKey((current) => current + 1)
  }, [reloadEvents])

  function handleSelectCalendar(calendarId) {
    setSelectedOccurrence(null)
    calendarsApi.setSelectedCalendarId(calendarId)
  }

  function handleViewChange(nextView) {
    if (nextView === view) {
      return
    }
    setView(nextView)
    calendarRef.current?.getApi().changeView(fcViewType(nextView))
  }

  function handleDatesSet(info) {
    setRangeLabel(info.view.title)
    eventsApi.setRange({
      start: info.start.toISOString(),
      end: info.end.toISOString(),
      timezone: getBrowserTimeZone(),
    })
  }

  function handleSlotSelect(info) {
    if (!hasCalendar) return
    const viewType = info?.view?.type
    // Preserve existing Month view behavior (date click navigates to Day view).
    if (viewType === 'dayGridMonth') {
      calendarRef.current?.getApi().unselect()
      return
    }

    const tz = getBrowserTimeZone()
    const start = info.start
    const end = info.end
    const pad = (n) => String(n).padStart(2, '0')
    const localWall = (d) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    const localDate = (d) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

    if (info.allDay) {
      // FullCalendar all-day selection end is exclusive.
      setEditor({
        open: true,
        mode: 'create',
        event: null,
        occurrence: null,
        calendarId: selectedCalendarId,
        initialAllDay: true,
        initialStartDate: localDate(start),
        initialEndDate: localDate(end),
      })
    } else {
      setEditor({
        open: true,
        mode: 'create',
        event: null,
        occurrence: null,
        calendarId: selectedCalendarId,
        initialAllDay: false,
        initialStartAt: localWall(start),
        initialEndAt: localWall(end),
        initialTimeZone: tz,
      })
    }
    calendarRef.current?.getApi().unselect()
  }

  function handleEventClick(info) {
    info.jsEvent.preventDefault()
    info.jsEvent.stopPropagation()
    const raw = info.event.extendedProps?.raw
    if (raw) {
      setSelectedOccurrence(occurrenceToSelection(raw))
    }
  }

  /** Build a description of a drag/resize change from a FullCalendar event. */
  function describeChange(fcEvent, kind) {
    const ext = fcEvent.extendedProps || {}
    const raw = ext.raw || {}
    const isAllDay = Boolean(fcEvent.allDay)
    const timezone = ext.timezone || raw.timezone || getBrowserTimeZone()
    if (isAllDay) {
      return {
        kind,
        eventId: ext.eventId,
        calendarId: ext.calendarId ?? selectedCalendarId,
        isAllDay: true,
        isRecurring: Boolean(ext.isRecurring),
        originalStartAt: ext.originalStartAt || null,
        originalStartDate: ext.originalStartDate || null,
        timezone,
        startDate: fcEvent.startStr,
        endDate: fcEvent.endStr,
      }
    }
    return {
      kind,
      eventId: ext.eventId,
      calendarId: ext.calendarId ?? selectedCalendarId,
      isAllDay: false,
      isRecurring: Boolean(ext.isRecurring),
      originalStartAt: ext.originalStartAt || null,
      originalStartDate: ext.originalStartDate || null,
      timezone,
      startAt: fcEvent.start.toISOString(),
      endAt: fcEvent.end.toISOString(),
    }
  }

  async function persistNonRecurringChange(change) {
    const calendarId = change.calendarId
    const eventId = change.eventId
    if (!calendarId || !eventId) return
    const updates = {}
    if (change.isAllDay) {
      updates.start_date = change.startDate
      updates.end_date = change.endDate
    } else {
      updates.start_at = change.startAt
      updates.end_at = change.endAt
      updates.timezone = change.timezone
    }
    try {
      await updateEvent(calendarId, eventId, updates)
      eventsApi.reload()
      setDetailsRefreshKey((c) => c + 1)
    } catch (err) {
      setDragError(err?.message || 'Could not move the event.')
      throw err
    }
  }

  function handleEventDrop(info) {
    const change = describeChange(info.event, 'drop')
    if (change.isRecurring) {
      info.revert()
      setDragScope('occurrence')
      setDragError('')
      setDragScopeTarget(change)
      return
    }
    // Non-recurring: keep visual, persist in background.
    persistNonRecurringChange(change).catch(() => {
      info.revert()
    })
  }

  function handleEventResize(info) {
    const change = describeChange(info.event, 'resize')
    if (change.isRecurring) {
      info.revert()
      setDragScope('occurrence')
      setDragError('')
      setDragScopeTarget(change)
      return
    }
    persistNonRecurringChange(change).catch(() => {
      info.revert()
    })
  }

  async function confirmDragScope() {
    const change = dragScopeTarget
    if (!change) return
    setDragBusy(true)
    setDragError('')
    const calendarId = change.calendarId
    const eventId = change.eventId
    try {
      const payload = {}
      if (change.isAllDay) {
        payload.start_date = change.startDate
        payload.end_date = change.endDate
      } else {
        payload.start_at = change.startAt
        payload.end_at = change.endAt
        payload.timezone = change.timezone
      }
      if (change.isRecurring) {
        const originalKey = change.isAllDay
          ? change.originalStartDate
          : change.originalStartAt
        if (change.isAllDay) {
          payload.original_start_date = originalKey
        } else {
          payload.original_start_at = originalKey
        }
        payload.scope = dragScope
        await editOccurrence(calendarId, eventId, payload)
      } else {
        await updateEvent(calendarId, eventId, payload)
      }
      setDragScopeTarget(null)
      eventsApi.reload()
      setDetailsRefreshKey((c) => c + 1)
      setSelectedOccurrence(null)
    } catch (err) {
      setDragError(err?.message || 'Could not update the event.')
    } finally {
      setDragBusy(false)
    }
  }

  function cancelDragScope() {
    setDragScopeTarget(null)
    setDragError('')
  }

  function refreshAfterChange() {
    eventsApi.reload()
    setDetailsRefreshKey((current) => current + 1)
    // A saved edit can move or rewrite the selected occurrence; reopening the
    // panel from the refreshed grid avoids showing its pre-edit times.
    setSelectedOccurrence(null)
  }

  function openDelete(event, occurrence) {
    setDeleteError('')
    setDeleteScope(event?.recurrence_rule ? 'occurrence' : 'series')
    setDeleteTarget({ event, occurrence })
  }

  async function confirmDelete() {
    if (!deleteTarget?.event || !selectedCalendarId) {
      return
    }
    setDeleteBusy(true)
    setDeleteError('')
    try {
      const isRecurring = Boolean(deleteTarget.event.recurrence_rule)
      if (isRecurring && deleteScope === 'occurrence') {
        await createException(selectedCalendarId, deleteTarget.event.id, {
          original_start_at: deleteTarget.occurrence?.originalStartAt ?? null,
          original_start_date:
            deleteTarget.occurrence?.originalStartDate ?? null,
          is_cancelled: true,
        })
      } else {
        await deleteEvent(selectedCalendarId, deleteTarget.event.id)
      }
      setDeleteTarget(null)
      setSelectedOccurrence(null)
      refreshAfterChange()
    } catch (err) {
      setDeleteError(err?.message || 'Could not delete the event.')
    } finally {
      setDeleteBusy(false)
    }
  }

  const hasCalendar = Boolean(selectedCalendarId)
  const showCalendarPlaceholder =
    !calendarsLoading && !calendarsError && calendars.length === 0
  const showEventsLoading =
    hasCalendar && eventsApi.loading
  const showEventsError = hasCalendar && Boolean(eventsApi.error)
  const showNoEvents =
    hasCalendar && !eventsApi.loading && eventsApi.events.length === 0

  return (
    <div className="calendar-page">
          <CalendarToolbar
            view={view}
            rangeLabel={rangeLabel}
            onPrev={() => calendarRef.current?.getApi().prev()}
            onNext={() => calendarRef.current?.getApi().next()}
            onToday={() => calendarRef.current?.getApi().today()}
            onViewChange={handleViewChange}
            calendars={calendars}
            selectedCalendarId={selectedCalendarId}
            calendarsLoading={calendarsLoading}
            calendarsError={calendarsError}
            onSelectCalendar={handleSelectCalendar}
            onRetryCalendars={() => calendarsApi.reload()}
            onCreateCalendar={() =>
              setCalendarDialog({ open: true, calendar: null })
            }
            onManageCalendars={() =>
              setCalendarDialog({
                open: true,
                calendar: selectedCalendar || calendars[0] || null,
              })
            }
            canCreate={hasCalendar}
            onCreateEvent={() => setEditor({ open: true, mode: 'create' })}
          />

      <div className="calendar-surface" ref={surfaceRef}>
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            editable={hasCalendar}
            eventStartEditable={hasCalendar}
            eventDurationEditable={hasCalendar}
            eventResizableFromStart={false}
            initialView={fcViewType(initialView)}
            initialDate={requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : undefined}
            headerToolbar={false}
            footerToolbar={false}
            height="100%"
            expandRows
            stickyHeaderDates
            fixedWeekCount={false}
            dayMaxEvents={3}
            nowIndicator={view === 'timeGridDay'}
            timeZone="local"
            slotMinTime="00:00:00"
            slotMaxTime="24:00:00"
            scrollTime={SCROLL_TIME}
            slotDuration="00:30:00"
            snapDuration="00:15:00"
            slotLabelInterval="01:00"
            allDaySlot={view !== 'timeGridWeek'}
            selectable={hasCalendar}
            selectMirror
            unselectAuto
            weekends={true}
            events={eventsApi.events}
            eventClassNames={(arg) => {
              const { start, end } = arg.event
              const minutes = start && end ? (end - start) / 60000 : null
              return minutes !== null && minutes <= 30
                ? ['cal-event-compact']
                : []
            }}
            dayHeaderContent={(arg) => {
              if (arg.view.type === 'dayGridMonth') {
                return arg.text
              }
              const date = arg.date
              const weekday = date.toLocaleDateString(undefined, { weekday: 'short' })
              const dayNum = date.toLocaleDateString(undefined, { day: 'numeric' })
              if (arg.view.type === 'timeGridDay') {
                const full = date.toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })
                return {
                  html: `<div class="fc-day-header-rich"><span class="fc-day-name">${weekday}</span><span class="fc-day-number">${dayNum}</span><span class="fc-day-full">${full}</span></div>`,
                }
              }
              return {
                html: `<span class="fc-day-name">${weekday}</span><span class="fc-day-number">${dayNum}</span>`,
              }
            }}
            eventContent={(arg) => <CalendarEvent arg={arg} />}
            eventDidMount={(info) => {
              const category = info.event.extendedProps?.category
              const cat = categoryOf(category)
              info.el.style.setProperty('--evc-bg', cat.background)
              info.el.style.setProperty('--evc-accent', cat.accent)
              info.el.style.setProperty('--evc-text', cat.text)
              // FullCalendar re-mounts events on view changes; make sure the
              // guide lines are redrawn with the fresh event geometry even if
              // the DOM observer's last paint ran before the events mounted.
              guidesRef.current?.refresh()
            }}
            eventClick={handleEventClick}
            eventDrop={handleEventDrop}
            eventResize={handleEventResize}
            select={handleSlotSelect}
            dayCellDidMount={(info) => {
              if (info.view.type !== 'dayGridMonth') {
                return
              }
              const cell = info.el
              cell.style.cursor = 'pointer'
              cell.setAttribute('tabindex', '0')
              cell.setAttribute(
                'aria-label',
                info.date.toLocaleDateString(undefined, {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })
              )
              const handleClick = (e) => {
                if (e.target?.closest?.('.fc-event, .fc-more-link, .fc-daygrid-more-link')) {
                  return
                }
                const api = calendarRef.current?.getApi()
                if (!api) return
                setView('timeGridDay')
                api.changeView('timeGridDay', info.date)
                setSelectedOccurrence(null)
              }
              cell.addEventListener('click', handleClick)
              const handleKeyDown = (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  const api = calendarRef.current?.getApi()
                  if (!api) return
                  setView('timeGridDay')
                  api.changeView('timeGridDay', info.date)
                  setSelectedOccurrence(null)
                }
              }
              cell.addEventListener('keydown', handleKeyDown)
            }}
            datesSet={handleDatesSet}
            noEventsText="No events scheduled"
            listDayFormat={{ weekday: 'short', month: 'short', day: 'numeric' }}
            listDaySideFormat={false}
            allDayText="All day"
          />

          {showCalendarPlaceholder && (
            <CalendarOverlay>
              <EmptyState
                title="No calendars yet"
                description="Create a calendar to start adding events."
              >
                <Button
                  type="button"
                  size="sm"
                  className="h-8"
                  onClick={() =>
                    setCalendarDialog({ open: true, calendar: null })
                  }
                >
                  Create calendar
                </Button>
              </EmptyState>
            </CalendarOverlay>
          )}

          {calendarsLoading && (
            <CalendarOverlay>
              <LoadingState label="Loading calendars…" />
            </CalendarOverlay>
          )}

          {!calendarsLoading && calendarsError && (
            <CalendarOverlay>
              <ErrorState
                title="Calendars unavailable"
                message={calendarsError}
                onRetry={() => calendarsApi.reload()}
              />
            </CalendarOverlay>
          )}

          {showEventsLoading && (
            <CalendarOverlay>
              <LoadingState label="Loading events…" />
            </CalendarOverlay>
          )}

          {showEventsError && (
            <CalendarOverlay>
              <ErrorState
                title="Could not load events"
                message={eventsApi.error}
                onRetry={eventsApi.reload}
              />
            </CalendarOverlay>
          )}

          {showNoEvents && (
            <CalendarOverlay passthrough>
              <EmptyState
                title="No events scheduled"
                description="Select a time slot to create an event."
                role="status"
              />
            </CalendarOverlay>
          )}
        </div>

        {selectedOccurrence && hasCalendar && (
          <EventDetailPanel
            occurrence={selectedOccurrence}
            calendar={selectedCalendar}
            refreshKey={detailsRefreshKey}
            onClose={() => setSelectedOccurrence(null)}
            onEdit={(event, occurrence) =>
              setEditor({ open: true, mode: 'edit', event, occurrence })
            }
            onDelete={openDelete}
            onUnauthorized={handleUnauthorized}
          />
        )}

        <EventDialog
          open={editor.open}
          mode={editor.mode}
          event={editor.event}
          occurrence={editor.occurrence}
          calendarId={editor.calendarId || selectedCalendarId}
          calendars={calendars}
          initialAllDay={editor.initialAllDay}
          initialStartAt={editor.initialStartAt}
          initialEndAt={editor.initialEndAt}
          initialStartDate={editor.initialStartDate}
          initialEndDate={editor.initialEndDate}
          initialTimeZone={editor.initialTimeZone}
          onClose={() => setEditor({ open: false, mode: 'create' })}
          onSaved={refreshAfterChange}
        />

        <CalendarDialog
          open={calendarDialog.open}
          calendar={calendarDialog.calendar}
          saving={calendarsApi.saving}
          onClose={() => setCalendarDialog({ open: false, calendar: null })}
          onCreate={(payload) => calendarsApi.create(payload)}
          onUpdate={(id, updates) => calendarsApi.update(id, updates)}
          onDelete={(id) => calendarsApi.remove(id)}
        />

        <ConfirmDialog
          open={Boolean(deleteTarget)}
          contentClassName="cal-dialog"
          title="Delete event"
          description={
            deleteTarget?.event?.recurrence_rule
              ? 'This event repeats. Choose what to delete.'
              : `Delete “${deleteTarget?.event?.title || deleteTarget?.occurrence?.title || 'this event'}”?`
          }
          confirmLabel="Delete"
          busy={deleteBusy}
          error={deleteError}
          onConfirm={confirmDelete}
          onClose={() => {
            setDeleteTarget(null)
            setDeleteError('')
          }}
        >
          {deleteTarget?.event?.recurrence_rule && (
            <div className="grid gap-2">
              <RadioOption
                name="delete-scope"
                value="occurrence"
                title="This occurrence"
                description="Cancels only the selected occurrence."
                checked={deleteScope === 'occurrence'}
                onChange={() => setDeleteScope('occurrence')}
              />
              <RadioOption
                name="delete-scope"
                value="series"
                title="All occurrences"
                description="Deletes the whole series."
                checked={deleteScope === 'series'}
                onChange={() => setDeleteScope('series')}
              />
            </div>
          )}
        </ConfirmDialog>

        <ConfirmDialog
          open={Boolean(dragScopeTarget)}
          contentClassName="cal-dialog"
          title="Move recurring event"
          description="This event repeats. Apply the change to:"
          confirmLabel="Apply"
          busyLabel="Saving…"
          destructive={false}
          busy={dragBusy}
          error={dragError}
          onConfirm={confirmDragScope}
          onClose={cancelDragScope}
        >
          <div className="grid gap-2">
            <RadioOption
              name="drag-scope"
              value="occurrence"
              title="This occurrence"
              description="Only the selected occurrence changes."
              checked={dragScope === 'occurrence'}
              onChange={() => setDragScope('occurrence')}
              disabled={dragBusy}
            />
            <RadioOption
              name="drag-scope"
              value="series"
              title="Entire series"
              description="All occurrences move or resize together."
              checked={dragScope === 'series'}
              onChange={() => setDragScope('series')}
              disabled={dragBusy}
            />
          </div>
        </ConfirmDialog>

        {dragError && !dragScopeTarget && (
          <div
            className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-[var(--radius-md)] border border-destructive/30 bg-card px-3.5 py-2 text-[13px] text-destructive shadow-md"
            role="alert"
          >
            {dragError}
          </div>
        )}

      {/* Floating assistant is scoped to the Calendar page only. */}
      <CalendarAgent onCalendarChanged={handleAgentCalendarChange} />
    </div>
  )
}
