/** Event chip content: time (when shown by the view) plus the event title. */
export default function CalendarEvent({ arg }) {
  const { event, timeText, view } = arg
  const isRecurring = Boolean(event.extendedProps?.isRecurring)
  const isAllDay = event.allDay

  // Week columns are narrow; the full "start - end" range clips there, so
  // show only the start time and let the block's height convey the duration.
  const isWeekView = view?.type === 'timeGridWeek'
  const displayTime = isWeekView && timeText
    ? timeText.split(' - ')[0].trim()
    : timeText

  return (
    <div
      className={isAllDay ? 'calendar-event calendar-event--all-day' : 'calendar-event'}
    >
      {!isAllDay && displayTime && (
        <span className="calendar-event-time">{displayTime}</span>
      )}
      <span className="calendar-event-title">{event.title}</span>
      {isRecurring && (
        <span className="calendar-event-recurring" aria-label="Repeating">
          &#8635;
        </span>
      )}
    </div>
  )
}