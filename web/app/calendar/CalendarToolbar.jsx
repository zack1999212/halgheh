import { CalendarDays, Plus } from 'lucide-react'
import CalendarSelector from './CalendarSelector.jsx'

/**
 * Calendar page chrome in the 3D Pop language: a floating black-glass pill
 * holding the module title, the calendar selector ("filter") and the yellow
 * primary action. Month/week navigation and the view switcher live inside the
 * white calendar card below (see CalendarPage).
 */
export default function CalendarToolbar({
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
  return (
    <div className="cal-topbar">
      <div className="cal-topbar-inner">
        <div className="cal-brand">
          <span className="cal-brand-mark" aria-hidden="true">
            <CalendarDays size={15} strokeWidth={2.6} />
          </span>
          <span className="cal-brand-text">
            Workspace&nbsp;·&nbsp;<span className="cal-brand-crumb">Calendar</span>
          </span>
        </div>

        <div className="cal-topbar-actions">
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
            className="cal-cta"
            onClick={onCreateEvent}
            disabled={!canCreate}
            title={canCreate ? undefined : 'Create a calendar first'}
          >
            <Plus size={16} strokeWidth={2.4} aria-hidden="true" />
            <span className="cal-cta-label">Create event</span>
          </button>
        </div>
      </div>
    </div>
  )
}
