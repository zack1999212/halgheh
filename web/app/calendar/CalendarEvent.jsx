import { categoryOf } from './categories.js'

/** Event chip content: time (when the view shows it) plus the event title. */
export default function CalendarEvent({ arg }) {
  const { event, timeText, view } = arg
  const isRecurring = Boolean(event.extendedProps?.isRecurring)
  const isAllDay = event.allDay
  const viewType = view?.type || ''
  const isWeekView = viewType === 'timeGridWeek'
  const isTimeGrid = viewType.startsWith('timeGrid')
  const isList = viewType.startsWith('list')
  const category = categoryOf(event.extendedProps?.category)

  // Week columns are narrow; the full "start - end" range clips there, so
  // show only the start time and let the block's height convey the duration.
  const displayTime =
    isWeekView && timeText ? timeText.split(' - ')[0].trim() : timeText

  return (
    <div
      className={
        isAllDay ? 'calendar-event calendar-event--all-day' : 'calendar-event'
      }
    >
      {isTimeGrid && !isAllDay && displayTime && (
        <span className="calendar-event-time">{displayTime}</span>
      )}
      <span className="calendar-event-head">
        <span className="calendar-event-title">{event.title}</span>
        {isRecurring && (
          <span
            className="calendar-event-recurring"
            aria-label="Repeating"
            title="Repeating"
          >
            &#8635;
          </span>
        )}
        {isList && (
          <span
            className="calendar-event-cat"
            style={{
              background: category.background,
              borderColor: category.accent,
              color: category.text,
            }}
          >
            {category.label}
          </span>
        )}
      </span>
    </div>
  )
}
