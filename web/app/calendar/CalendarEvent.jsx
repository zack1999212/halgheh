/** Event chip content: time (when shown by the view) plus the event title. */
export default function CalendarEvent({ arg }) {
  const { event, timeText } = arg
  const isRecurring = Boolean(event.extendedProps?.isRecurring)

  return (
    <div
      className={`calendar-event${event.allDay ? ' calendar-event--all-day' : ''}`}
    >
      {timeText && <span className="calendar-event-time">{timeText}</span>}
      <span className="calendar-event-title">{event.title}</span>
      {isRecurring && (
        <span className="calendar-event-recurring" aria-label="Repeating">
          &#8635;
        </span>
      )}
    </div>
  )
}
