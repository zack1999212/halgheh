import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
import ConfirmDialog from './ConfirmDialog.jsx'
import useCalendars from './useCalendars.js'
import useCalendarEvents, { occurrenceToSelection } from './useCalendarEvents.js'
import { createException, deleteEvent, editOccurrence, updateEvent } from './api.js'
import { getBrowserTimeZone } from './time.js'
import { clearToken } from '../src/api.js'
import { DEFAULT_VIEW } from './views.js'
import { categoryOf } from './categories.js'
import CalendarAgent from './agent/CalendarAgent.jsx'
import './calendar.css'

export default function CalendarPage() {
  const calendarRef = useRef(null)
  const navigate = useNavigate()

  const [view, setView] = useState(DEFAULT_VIEW)
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
    calendarRef.current?.getApi().changeView(nextView)
  }

  function handleDatesSet(info) {
    setRangeLabel(info.view.title)
    eventsApi.setRange({
      start: info.start.toISOString(),
      end: info.end.toISOString(),
      timezone: getBrowserTimeZone(),
    })
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

      <div className="calendar-surface">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          editable
          eventStartEditable
          eventDurationEditable
          eventResizableFromStart={false}
          initialView={DEFAULT_VIEW}
          headerToolbar={false}
          footerToolbar={false}
          height="100%"
          expandRows
          fixedWeekCount={false}
          dayMaxEvents={3}
          nowIndicator
          timeZone="local"
          events={eventsApi.events}
          eventContent={(arg) => <CalendarEvent arg={arg} />}
          eventDidMount={(info) => {
            const category = info.event.extendedProps?.category
            const cat = categoryOf(category)
            info.el.style.setProperty('--evc-bg', cat.background)
            info.el.style.setProperty('--evc-accent', cat.accent)
            info.el.style.setProperty('--evc-text', cat.text)
          }}
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          eventResize={handleEventResize}
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
          <div className="calendar-overlay">
            <div className="calendar-state">
              <p className="calendar-state-title">No calendars yet</p>
              <p className="calendar-state-text">
                Create a calendar to start adding events.
              </p>
              <button
                type="button"
                className="button-primary"
                onClick={() =>
                  setCalendarDialog({ open: true, calendar: null })
                }
              >
                Create calendar
              </button>
            </div>
          </div>
        )}

        {calendarsLoading && (
          <div className="calendar-overlay">
            <div className="calendar-state">
              <p className="calendar-state-text">Loading calendars…</p>
            </div>
          </div>
        )}

        {!calendarsLoading && calendarsError && (
          <div className="calendar-overlay" role="alert">
            <div className="calendar-state">
              <p className="calendar-state-title">Calendars unavailable</p>
              <p className="calendar-state-text">{calendarsError}</p>
              <button
                type="button"
                className="button-secondary"
                onClick={() => calendarsApi.reload()}
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {showEventsLoading && (
          <div className="calendar-overlay">
            <div className="calendar-state">
              <p className="calendar-state-text">Loading events…</p>
            </div>
          </div>
        )}

        {showEventsError && (
          <div className="calendar-overlay" role="alert">
            <div className="calendar-state">
              <p className="calendar-state-title">Could not load events</p>
              <p className="calendar-state-text">{eventsApi.error}</p>
              <button
                type="button"
                className="button-secondary"
                onClick={eventsApi.reload}
              >
                Retry
              </button>
            </div>
          </div>
        )}
        {showNoEvents && (
          <div className="calendar-overlay" role="alert">
            <div className="calendar-state">
              <p className="calendar-state-title">No events scheduled</p>
              <p className="calendar-state-text">
                Create an event to get started.
              </p>
            </div>
          </div>
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
        calendarId={selectedCalendarId}
        calendars={calendars}
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
          <div className="scope-options">
            <label className="scope-option">
              <input
                type="radio"
                name="delete-scope"
                value="occurrence"
                checked={deleteScope === 'occurrence'}
                onChange={() => setDeleteScope('occurrence')}
              />
              <span>
                <span className="scope-option-label">This occurrence</span>
                <span className="scope-option-hint">
                  Cancels only the selected occurrence.
                </span>
              </span>
            </label>
            <label className="scope-option">
              <input
                type="radio"
                name="delete-scope"
                value="series"
                checked={deleteScope === 'series'}
                onChange={() => setDeleteScope('series')}
              />
              <span>
                <span className="scope-option-label">All occurrences</span>
                <span className="scope-option-hint">
                  Deletes the whole series.
                </span>
              </span>
            </label>
          </div>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(dragScopeTarget)}
        title="Move recurring event"
        description="This event repeats. Apply the change to:"
        confirmLabel="Apply"
        busyLabel="Saving…"
        busy={dragBusy}
        error={dragError}
        onConfirm={confirmDragScope}
        onClose={cancelDragScope}
      >
        <div className="scope-options">
          <label className="scope-option">
            <input
              type="radio"
              name="drag-scope"
              value="occurrence"
              checked={dragScope === 'occurrence'}
              onChange={() => setDragScope('occurrence')}
              disabled={dragBusy}
            />
            <span>
              <span className="scope-option-label">This occurrence</span>
              <span className="scope-option-hint">
                Only the selected occurrence changes.
              </span>
            </span>
          </label>
          <label className="scope-option">
            <input
              type="radio"
              name="drag-scope"
              value="series"
              checked={dragScope === 'series'}
              onChange={() => setDragScope('series')}
              disabled={dragBusy}
            />
            <span>
              <span className="scope-option-label">Entire series</span>
              <span className="scope-option-hint">
                All occurrences move or resize together.
              </span>
            </span>
          </label>
        </div>
      </ConfirmDialog>

      {dragError && !dragScopeTarget && (
        <div className="calendar-toast" role="alert">
          {dragError}
        </div>
      )}

      {/* Floating assistant is scoped to the Calendar page only. */}
      <CalendarAgent onCalendarChanged={handleAgentCalendarChange} />
    </div>
  )
}
