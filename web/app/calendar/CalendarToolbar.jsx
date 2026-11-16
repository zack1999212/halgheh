import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import CalendarSelector from './CalendarSelector.jsx'
import CalendarViewSelector from './CalendarViewSelector.jsx'
import { periodName } from './views.js'

export default function CalendarToolbar({
  view,
  rangeLabel,
  onPrev,
  onNext,
  onToday,
  onViewChange,
  calendars = [],
  selectedCalendarId,
  calendarsLoading = false,
  calendarsError = '',
  onSelectCalendar,
  onRetryCalendars,
  onCreateCalendar,
  onManageCalendars,
  canCreate = false,
  onCreateEvent,
}) {
  const period = periodName(view)

  return (
    <div className="calendar-toolbar">
      {/* Level 1: Primary header — title, calendar selector, create event */}
      <div className="calendar-toolbar-header-1">
        <h2 className="calendar-toolbar-title">Calendar</h2>

        <CalendarSelector
          calendars={calendars}
          selectedId={selectedCalendarId}
          loading={calendarsLoading}
          error={calendarsError}
          onSelect={onSelectCalendar}
          onRetry={onRetryCalendars}
          onCreate={onCreateCalendar}
          onManage={onManageCalendars}
        />

        <button
          type="button"
          className="button-primary calendar-create-button"
          onClick={onCreateEvent}
          disabled={!canCreate}
          title={canCreate ? undefined : 'Create a calendar first'}
        >
          <Plus size={15} aria-hidden="true" />
          Create event
        </button>
      </div>

      {/* Level 2: Navigation toolbar — prev, today, next, date range, view selector */}
      <div className="calendar-toolbar-header-2">
        <div className="calendar-nav">
          <button
            type="button"
            className="calendar-nav-button"
            onClick={onPrev}
            aria-label={`Previous ${period}`}
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="calendar-today-button"
            onClick={onToday}
          >
            Today
          </button>
          <button
            type="button"
            className="calendar-nav-button"
            onClick={onNext}
            aria-label={`Next ${period}`}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>

        <p className="calendar-range" aria-live="polite">
          {rangeLabel}
        </p>

        <CalendarViewSelector view={view} onChange={onViewChange} />
      </div>
    </div>
  )
}