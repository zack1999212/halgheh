import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import CalendarToolbar from './CalendarToolbar.jsx'
import CalendarEvent from './CalendarEvent.jsx'
import EventDetailPanel from './EventDetailPanel.jsx'
import EventDialog from './EventDialog.jsx'
import CalendarDialog from './CalendarDialog.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'
import useCalendars from './useCalendars.js'
import useCalendarEvents, { occurrenceToSelection } from './useCalendarEvents.js'
import { createException, deleteEvent } from './api.js'
import { getBrowserTimeZone } from './time.js'
import { clearToken } from '../src/api.js'
import { DEFAULT_VIEW } from './views.js'
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
    const raw = info.event.extendedProps?.raw
    if (raw) {
      setSelectedOccurrence(occurrenceToSelection(raw))
    }
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
    hasCalendar && eventsApi.loading && eventsApi.events.length === 0
  const showEventsError = hasCalendar && Boolean(eventsApi.error)

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
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin]}
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
          eventClick={handleEventClick}
          datesSet={handleDatesSet}
          noEventsText="No events scheduled"
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
    </div>
  )
}
