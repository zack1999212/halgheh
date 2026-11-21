import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
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
import CalendarEvent from '../../calendar/CalendarEvent.jsx'
import CalendarAside from '../../calendar/CalendarAside.jsx'
import CalendarViewSelector from '../../calendar/CalendarViewSelector.jsx'
import EventDetailPanel from '../../calendar/EventDetailPanel.jsx'
import EventDialog from '../../calendar/EventDialog.jsx'
import useCalendars from '../../calendar/useCalendars.js'
import useCalendarEvents, { occurrenceToSelection } from '../../calendar/useCalendarEvents.js'
import { createException, deleteEvent, editOccurrence, updateEvent } from '../../calendar/api.js'
import { getBrowserTimeZone } from '../../calendar/time.js'
import { CALENDAR_VIEWS, DEFAULT_VIEW, fcViewType, periodName } from '../../calendar/views.js'
import { categoryOf } from '../../calendar/categories.js'
import { createTimeGridGuides } from '../../calendar/timeGridGuides.js'
import '../../calendar/calendar.css'

function canManageContent(role) {
  return role === 'owner' || role === 'admin' || role === 'editor'
}

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

const SCROLL_TIME = '05:30:00'

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date, amount) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

function dayKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function upcomingTimeLabel(event) {
  if (!event?.start) return ''
  const start = new Date(event.start)
  if (event.allDay) return 'All day'
  const weekday = start.toLocaleDateString(undefined, { weekday: 'short' })
  const time = (date) =>
    date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (!event.end) return `${weekday} · ${time(start)}`
  return `${weekday} · ${time(start)} – ${time(new Date(event.end))}`
}

function eventDayKeys(event) {
  if (!event?.start) return []
  const first = startOfDay(new Date(event.start))
  const rawEnd = event.end ? new Date(event.end) : new Date(event.start)
  const last = event.allDay ? new Date(rawEnd.getTime() - 1) : rawEnd
  const keys = []
  let cursor = first
  for (let guard = 0; cursor <= last && guard < 400; guard += 1) {
    keys.push(dayKey(cursor))
    cursor = addDays(cursor, 1)
  }
  return keys.length > 0 ? keys : [dayKey(first)]
}

export default function ProjectCalendarPage() {
  const { projectId } = useParams()
  const outlet = useOutletContext() || {}
  const role = outlet.role || outlet.project?.current_user_role
  const canManage = canManageContent(role)
  const readOnly = !canManage

  const calendarRef = useRef(null)
  const surfaceRef = useRef(null)
  const guidesRef = useRef(null)

  const [view, setView] = useState(DEFAULT_VIEW)
  const [miniMonth, setMiniMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selectedDay, setSelectedDay] = useState(() => new Date())
  const [rangeLabel, setRangeLabel] = useState('')
  const [selectedOccurrence, setSelectedOccurrence] = useState(null)
  const [detailsRefreshKey, setDetailsRefreshKey] = useState(0)
  const [editor, setEditor] = useState({ open: false, mode: 'create' })
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteScope, setDeleteScope] = useState('series')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [dragScopeTarget, setDragScopeTarget] = useState(null)
  const [dragScope, setDragScope] = useState('occurrence')
  const [dragBusy, setDragBusy] = useState(false)
  const [dragError, setDragError] = useState('')
  const [actionError, setActionError] = useState('')

  const handleUnauthorized = useCallback(() => {
    outlet.onUnauthorized?.()
  }, [outlet])

  const calendarsApi = useCalendars({ onUnauthorized: handleUnauthorized })

  const eventsApi = useCalendarEvents({
    projectId,
    onUnauthorized: handleUnauthorized,
  })

  function openDayView(date) {
    setView('timeGridDay')
    calendarRef.current?.getApi().changeView('timeGridDay', date)
    setSelectedOccurrence(null)
  }

  useEffect(() => {
    let outer, inner
    outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        const root = surfaceRef.current
        const scroller = root?.querySelector('.fc-scroller-liquid-absolute')
        const slot = root?.querySelector(
          `.fc-timegrid-slot-lane[data-time="${SCROLL_TIME}"]`
        )
        if (!scroller || !slot) return
        scroller.scrollTop = slot.offsetTop
      })
    })
    return () => {
      cancelAnimationFrame(outer)
      if (inner) cancelAnimationFrame(inner)
    }
  }, [view])

  useEffect(() => {
    const surface = surfaceRef.current
    if (!surface) return undefined
    const guides = createTimeGridGuides(surface)
    guidesRef.current = guides
    return () => {
      guides.destroy()
      guidesRef.current = null
    }
  }, [])

  useEffect(() => {
    const surface = surfaceRef.current
    if (!surface || typeof ResizeObserver === 'undefined') return undefined
    let frame = 0
    const schedule = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        syncMonthRowHeight()
      })
    }
    const observer = new ResizeObserver(schedule)
    observer.observe(surface)
    return () => {
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const events = eventsApi.events
  const eventDays = useMemo(() => {
    const map = new Map()
    for (const event of events) {
      const accent = categoryOf(event.extendedProps?.category).accent
      for (const key of eventDayKeys(event)) {
        if (!map.has(key)) map.set(key, accent)
      }
    }
    return map
  }, [events])

  const upcoming = useMemo(() => {
    const cutoff = startOfDay(new Date())
    return events
      .filter((event) => event.start && new Date(event.start) >= cutoff)
      .slice()
      .sort((a, b) => new Date(a.start) - new Date(b.start))
      .slice(0, 5)
      .map((event, index) => ({
        key: `${event.id ?? 'event'}-${index}`,
        date: new Date(event.start),
        title: event.title,
        timeLabel: upcomingTimeLabel(event),
        category: categoryOf(event.extendedProps?.category),
        raw: event.extendedProps?.raw,
      }))
  }, [events])

  function handleViewChange(nextView) {
    if (nextView === view) return
    setView(nextView)
    calendarRef.current?.getApi().changeView(fcViewType(nextView))
  }

  function syncMonthRowHeight() {
    const surface = surfaceRef.current
    if (!surface || !surface.querySelector('.fc-dayGridMonth-view')) return
    const table = surface.querySelector('.fc-scrollgrid-sync-table')
    if (!table) return
    const rows = table.querySelectorAll('tbody > tr').length
    if (!rows) return
    const spacing = Number.parseFloat(getComputedStyle(table).borderSpacing) || 6
    const available = table.clientHeight - (rows + 1) * spacing
    const rowHeight = Math.floor(available / rows)
    if (Number.isFinite(rowHeight) && rowHeight > 0) {
      surface.style.setProperty('--cal-month-row-h', `${rowHeight}px`)
    }
  }

  function handleDatesSet(info) {
    setRangeLabel(info.view.title)
    const currentStart = info.view.currentStart
    setMiniMonth(new Date(currentStart.getFullYear(), currentStart.getMonth(), 1))
    if (info.view.type === 'timeGridDay') {
      setSelectedDay(new Date(currentStart))
    }

    const infoStart = info.start.getTime()
    const infoEnd = info.end.getTime()
    const firstMonth = new Date(info.start.getFullYear(), info.start.getMonth(), 1)
    const afterLastMonth = new Date(info.end.getFullYear(), info.end.getMonth() + 1, 1)
    eventsApi.setRange({
      start: new Date(Math.min(infoStart, firstMonth.getTime())).toISOString(),
      end: new Date(Math.max(infoEnd, afterLastMonth.getTime())).toISOString(),
      timezone: getBrowserTimeZone(),
    })

    if (info.view.type === 'dayGridMonth') {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => syncMonthRowHeight())
      })
    } else {
      surfaceRef.current?.style.removeProperty('--cal-month-row-h')
    }
  }

  function handleToday() {
    calendarRef.current?.getApi().today()
    const now = new Date()
    setSelectedDay(now)
    setMiniMonth(new Date(now.getFullYear(), now.getMonth(), 1))
  }

  function shiftMiniMonth(delta) {
    const next = new Date(miniMonth.getFullYear(), miniMonth.getMonth() + delta, 1)
    setMiniMonth(next)
    calendarRef.current?.getApi().gotoDate(next)
  }

  function handleSelectMiniDay(date) {
    setSelectedDay(date)
    calendarRef.current?.getApi().gotoDate(date)
  }

  function openScheduledEvent(item) {
    if (item?.raw) {
      setSelectedOccurrence(occurrenceToSelection(item.raw))
    }
  }

  function handleSlotSelect(info) {
    if (readOnly) {
      calendarRef.current?.getApi().unselect()
      return
    }
    const viewType = info?.view?.type
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

    const defaultCalendarId = calendarsApi.selectedCalendarId || calendarsApi.calendars[0]?.id || null
    if (info.allDay) {
      setEditor({
        open: true,
        mode: 'create',
        event: null,
        occurrence: null,
        calendarId: defaultCalendarId,
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
        calendarId: defaultCalendarId,
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

  function describeChange(fcEvent, kind) {
    const ext = fcEvent.extendedProps || {}
    const raw = ext.raw || {}
    const isAllDay = Boolean(fcEvent.allDay)
    const timezone = ext.timezone || raw.timezone || getBrowserTimeZone()
    const calendarId = ext.calendarId ?? raw.calendar_id ?? null
    if (isAllDay) {
      return {
        kind,
        eventId: ext.eventId,
        calendarId,
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
      calendarId,
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
    if (readOnly) { info.revert(); return }
    const change = describeChange(info.event, 'drop')
    if (change.isRecurring) {
      info.revert()
      setDragScope('occurrence')
      setDragError('')
      setDragScopeTarget(change)
      return
    }
    persistNonRecurringChange(change).catch(() => { info.revert() })
  }

  function handleEventResize(info) {
    if (readOnly) { info.revert(); return }
    const change = describeChange(info.event, 'resize')
    if (change.isRecurring) {
      info.revert()
      setDragScope('occurrence')
      setDragError('')
      setDragScopeTarget(change)
      return
    }
    persistNonRecurringChange(change).catch(() => { info.revert() })
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
        const originalKey = change.isAllDay ? change.originalStartDate : change.originalStartAt
        if (change.isAllDay) payload.original_start_date = originalKey
        else payload.original_start_at = originalKey
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
    setSelectedOccurrence(null)
  }

  function openDelete(event, occurrence) {
    setDeleteError('')
    setDeleteScope(event?.recurrence_rule ? 'occurrence' : 'series')
    setDeleteTarget({ event, occurrence })
  }

  async function confirmDelete() {
    if (!deleteTarget?.event) return
    const calendarId = deleteTarget.occurrence?.calendarId || deleteTarget.occurrence?.calendar_id || null
    if (!calendarId) {
      setDeleteError('Could not determine the event calendar.')
      return
    }
    setDeleteBusy(true)
    setDeleteError('')
    try {
      const isRecurring = Boolean(deleteTarget.event.recurrence_rule)
      if (isRecurring && deleteScope === 'occurrence') {
        await createException(calendarId, deleteTarget.event.id, {
          original_start_at: deleteTarget.occurrence?.originalStartAt ?? null,
          original_start_date: deleteTarget.occurrence?.originalStartDate ?? null,
          is_cancelled: true,
        })
      } else {
        await deleteEvent(calendarId, deleteTarget.event.id)
      }
      setDeleteTarget(null)
      setSelectedOccurrence(null)
      refreshAfterChange()
    } catch (err) {
      if (err?.status === 401) { handleUnauthorized(); return }
      setDeleteError(err?.message || 'Could not delete the event.')
    } finally {
      setDeleteBusy(false)
    }
  }

  const hasCalendars = calendarsApi.calendars.length > 0
  const showEventsLoading = eventsApi.loading
  const showEventsError = Boolean(eventsApi.error)
  const showNoEvents = !eventsApi.loading && !eventsApi.error && eventsApi.events.length === 0
  const selectedCalendarForPanel = selectedOccurrence
    ? { id: selectedOccurrence.calendarId || selectedOccurrence.calendar_id || null }
    : null

  return (
    <div className={view === 'dayGridMonth' ? 'calendar-page cal-page--month' : 'calendar-page'}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-1">
        <div className="min-w-0">
          <h2 className="m-0 text-xl font-semibold tracking-[-0.02em]">Calendar</h2>
          <p className="mt-1 text-[13.5px] text-muted-foreground">Project-scoped events and occurrences. Personal calendar events are not shown.</p>
        </div>
        <div className="flex items-center gap-2">
          {readOnly && (
            <span className="inline-flex rounded-full border border-border bg-card px-2.5 py-1 text-[12px] font-medium text-muted-foreground">View only</span>
          )}
          {canManage && (
            <Button
              type="button"
              size="sm"
              className="h-9"
              disabled={!hasCalendars || calendarsApi.loading}
              title={!hasCalendars ? 'Create a personal calendar first to add project events.' : undefined}
              onClick={() => {
                const defaultCalendarId = calendarsApi.selectedCalendarId || calendarsApi.calendars[0]?.id || null
                setEditor({ open: true, mode: 'create', event: null, occurrence: null, calendarId: defaultCalendarId })
              }}
            >
              New event
            </Button>
          )}
        </div>
      </div>
      {actionError && <p className="px-1 text-[13px] text-destructive" role="alert">{actionError}</p>}

      <div className="cal-layout">
        <section className="cal-card on-white" aria-label="Project calendar">
          <div className="cal-card-head">
            <div className="cal-nav-group">
              <button type="button" className="cal-nav-btn" aria-label={`Previous ${periodName(view)}`} onClick={() => calendarRef.current?.getApi().prev()}>
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <button type="button" className="cal-nav-btn" aria-label={`Next ${periodName(view)}`} onClick={() => calendarRef.current?.getApi().next()}>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
              <button type="button" className="cal-today-btn" onClick={handleToday}>Today</button>
              <h1 className="cal-view-title" aria-live="polite">{rangeLabel || 'Calendar'}</h1>
              <span className="cal-deco" aria-hidden="true">
                <span className="cal-deco-cube" />
                <span className="cal-deco-sphere" />
                <span className="cal-deco-dot" />
              </span>
            </div>
            <CalendarViewSelector view={view} onChange={handleViewChange} />
          </div>

          <div className="calendar-surface" ref={surfaceRef}>
            <FullCalendar
              ref={calendarRef}
              plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
              editable={canManage}
              eventStartEditable={canManage}
              eventDurationEditable={canManage}
              eventResizableFromStart={false}
              initialView={fcViewType(DEFAULT_VIEW)}
              headerToolbar={false}
              footerToolbar={false}
              height={view === 'dayGridMonth' ? 'auto' : '100%'}
              expandRows
              stickyHeaderDates
              fixedWeekCount
              dayMaxEvents={3}
              nowIndicator
              timeZone="local"
              slotMinTime="00:00:00"
              slotMaxTime="24:00:00"
              scrollTime={SCROLL_TIME}
              slotDuration="00:30:00"
              snapDuration="00:15:00"
              slotLabelInterval="01:00"
              eventTimeFormat={{ hour: 'numeric', minute: '2-digit', meridiem: 'short' }}
              allDaySlot
              selectable={canManage}
              selectMirror
              unselectAuto
              weekends={true}
              events={eventsApi.events}
              eventClassNames={(arg) => {
                const { start, end } = arg.event
                const minutes = start && end ? (end - start) / 60000 : null
                return minutes !== null && minutes <= 30 ? ['cal-event-compact'] : []
              }}
              dayHeaderContent={(arg) => {
                if (arg.view.type === 'dayGridMonth') return arg.text
                const date = arg.date
                const weekday = date.toLocaleDateString(undefined, { weekday: 'short' })
                const dayNum = date.toLocaleDateString(undefined, { day: 'numeric' })
                if (arg.view.type === 'timeGridDay') {
                  const full = date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
                  return { html: `<div class="fc-day-header-rich"><span class="fc-day-name">${weekday}</span><span class="fc-day-number">${dayNum}</span><span class="fc-day-full">${full}</span></div>` }
                }
                return { html: `<span class="fc-day-name">${weekday}</span><span class="fc-day-number">${dayNum}</span>` }
              }}
              eventContent={(arg) => <CalendarEvent arg={arg} />}
              eventDidMount={(info) => {
                const category = info.event.extendedProps?.category
                const cat = categoryOf(category)
                info.el.style.setProperty('--evc-bg', cat.background)
                info.el.style.setProperty('--evc-accent', cat.accent)
                info.el.style.setProperty('--evc-text', cat.text)
                info.el.dataset.isAllDay = info.event.allDay ? 'true' : 'false'
                const timeLabel = info.event.allDay
                  ? 'All day'
                  : info.event.start?.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
                info.el.setAttribute('aria-label', [info.event.title, cat.label, timeLabel].filter(Boolean).join(', '))
                guidesRef.current?.refresh()
              }}
              eventClick={handleEventClick}
              eventDrop={handleEventDrop}
              eventResize={handleEventResize}
              select={handleSlotSelect}
              dateClick={(info) => {
                if (info.view.type === 'dayGridMonth') openDayView(info.date)
              }}
              dayCellDidMount={(info) => {
                if (info.view.type !== 'dayGridMonth') return
                const cell = info.el
                cell.style.cursor = 'pointer'
                cell.setAttribute('tabindex', '0')
                cell.setAttribute('aria-label', info.date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))
                const handleKeyDown = (e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDayView(info.date) }
                }
                cell.addEventListener('keydown', handleKeyDown)
              }}
              datesSet={handleDatesSet}
              noEventsText="No events scheduled"
              listDayFormat={{ weekday: 'short', month: 'short', day: 'numeric' }}
              listDaySideFormat={false}
              allDayText="All day"
            />

            {!calendarsApi.loading && !calendarsApi.error && !hasCalendars && canManage && (
              <CalendarOverlay passthrough>
                <EmptyState
                  title="No calendars available"
                  description="Create a personal calendar first to add project events. Project events are stored in a calendar and associated with this project."
                  role="status"
                />
              </CalendarOverlay>
            )}

            {showEventsLoading && (
              <CalendarOverlay>
                <LoadingState label="Loading project events…" />
              </CalendarOverlay>
            )}

            {showEventsError && (
              <CalendarOverlay>
                <ErrorState title="Could not load events" message={eventsApi.error} onRetry={eventsApi.reload} />
              </CalendarOverlay>
            )}

            {showNoEvents && (
              <CalendarOverlay passthrough>
                <EmptyState
                  title="No project events scheduled"
                  description={canManage ? 'Select a time slot to create a project event.' : 'No events have been added to this project yet.'}
                  role="status"
                />
              </CalendarOverlay>
            )}
          </div>
        </section>

        <CalendarAside
          monthDate={miniMonth}
          selectedDate={selectedDay}
          eventDays={eventDays}
          upcoming={upcoming}
          onPrevMonth={() => shiftMiniMonth(-1)}
          onNextMonth={() => shiftMiniMonth(1)}
          onSelectDay={handleSelectMiniDay}
          onOpenEvent={openScheduledEvent}
        />
      </div>

      {selectedOccurrence && (
        <EventDetailPanel
          occurrence={selectedOccurrence}
          calendar={selectedCalendarForPanel}
          refreshKey={detailsRefreshKey}
          readOnly={readOnly}
          onClose={() => setSelectedOccurrence(null)}
          onEdit={(event, occurrence) =>
            setEditor({
              open: true,
              mode: 'edit',
              event,
              occurrence,
              calendarId: occurrence?.calendarId || occurrence?.calendar_id || selectedCalendarForPanel?.id || null,
            })
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
        calendarId={editor.calendarId || calendarsApi.selectedCalendarId || calendarsApi.calendars[0]?.id || null}
        calendars={calendarsApi.calendars}
        projectId={projectId}
        initialAllDay={editor.initialAllDay}
        initialStartAt={editor.initialStartAt}
        initialEndAt={editor.initialEndAt}
        initialStartDate={editor.initialStartDate}
        initialEndDate={editor.initialEndDate}
        initialTimeZone={editor.initialTimeZone}
        onClose={() => setEditor({ open: false, mode: 'create' })}
        onSaved={refreshAfterChange}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        contentClassName="cal-dialog"
        title="Delete event"
        description={
          deleteTarget?.event?.recurrence_rule
            ? 'This event repeats. Choose what to delete.'
            : `Delete "${deleteTarget?.event?.title || deleteTarget?.occurrence?.title || 'this event'}"?`
        }
        confirmLabel="Delete"
        busy={deleteBusy}
        error={deleteError}
        onConfirm={confirmDelete}
        onClose={() => { setDeleteTarget(null); setDeleteError('') }}
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
          <RadioOption name="drag-scope" value="occurrence" title="This occurrence" description="Only the selected occurrence changes." checked={dragScope === 'occurrence'} onChange={() => setDragScope('occurrence')} disabled={dragBusy} />
          <RadioOption name="drag-scope" value="series" title="Entire series" description="All occurrences move or resize together." checked={dragScope === 'series'} onChange={() => setDragScope('series')} disabled={dragBusy} />
        </div>
      </ConfirmDialog>

      {dragError && !dragScopeTarget && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-[var(--radius-md)] border border-destructive/30 bg-card px-3.5 py-2 text-[13px] text-destructive shadow-md" role="alert">
          {dragError}
        </div>
      )}
    </div>
  )
}
