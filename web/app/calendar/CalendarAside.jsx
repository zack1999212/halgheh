import { ChevronLeft, ChevronRight } from 'lucide-react'
import { CATEGORIES } from './categories.js'

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function dayKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * Calendar sidebar: the pop-stack mini month, the category legend and the
 * upcoming list with 3D date cubes — all driven by the same live events as the
 * main grid.
 */
export default function CalendarAside({
  monthDate,
  selectedDate,
  eventDays,
  upcoming,
  onPrevMonth,
  onNextMonth,
  onSelectDay,
  onOpenEvent,
}) {
  const today = new Date()
  const todayKey = dayKey(today)
  const selectedKey = selectedDate ? dayKey(selectedDate) : null

  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const startPad = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells = []
  for (let index = 0; index < startPad; index += 1) {
    cells.push(
      <span key={`pad-${index}`} className="cal-md is-out" aria-hidden="true" />
    )
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day)
    const key = dayKey(date)
    const isToday = key === todayKey
    const isSelected = key === selectedKey && !isToday
    const accent = eventDays.get(key)
    const classes = ['cal-md']
    if (isSelected) classes.push('is-sel')
    if (isToday) classes.push('is-today')
    cells.push(
      <button
        key={key}
        type="button"
        className={classes.join(' ')}
        aria-label={date.toLocaleDateString(undefined, {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })}
        aria-current={isToday ? 'date' : undefined}
        onClick={() => onSelectDay(date)}
      >
        {day}
        {accent && (
          <span
            className="cal-md-dot"
            style={{ background: isToday ? '#0A0A0A' : accent }}
            aria-hidden="true"
          />
        )}
      </button>
    )
  }
  const totalCells = Math.ceil(cells.length / 7) * 7
  while (cells.length < totalCells) {
    cells.push(
      <span key={`tail-${cells.length}`} className="cal-md is-out" aria-hidden="true" />
    )
  }

  return (
    <aside className="cal-aside" aria-label="Calendar sidebar">
      <div className="cal-popwrap">
        <div className="cal-mini">
          <div className="cal-mini-head">
            <span className="cal-mini-title">
              {MONTHS[month]} {year}
            </span>
            <div className="cal-mini-nav">
              <button
                type="button"
                className="cal-mini-btn"
                aria-label="Previous month in mini calendar"
                onClick={onPrevMonth}
              >
                <ChevronLeft size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="cal-mini-btn"
                aria-label="Next month in mini calendar"
                onClick={onNextMonth}
              >
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="cal-mini-week" aria-hidden="true">
            {WEEKDAYS.map((label, index) => (
              <span key={`${label}-${index}`}>{label}</span>
            ))}
          </div>

          <div className="cal-mini-grid">{cells}</div>

          <div className="cal-legend" role="list" aria-label="Event categories">
            {CATEGORIES.map((category) => (
              <span
                key={category.id}
                className="cal-legend-item"
                role="listitem"
              >
                <span
                  className="cal-legend-dot"
                  style={{ background: category.accent }}
                  aria-hidden="true"
                />
                {category.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="cal-upcoming">
        <h2 className="cal-up-title">Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className="cal-up-empty">Nothing scheduled.</p>
        ) : (
          upcoming.map((item) => (
            <button
              key={item.key}
              type="button"
              className="cal-up-item"
              onClick={() => onOpenEvent(item)}
            >
              <span className="cal-cube" aria-hidden="true">
                <span className="cal-cube-depth" />
                <span className="cal-cube-face">{item.date.getDate()}</span>
              </span>
              <span className="cal-up-info">
                <span className="cal-up-name">{item.title}</span>
                <span className="cal-up-time">{item.timeLabel}</span>
              </span>
              <span
                className="cal-cat"
                style={{
                  background: item.category.background,
                  borderColor: item.category.accent,
                  color: item.category.text,
                }}
              >
                {item.category.label}
              </span>
            </button>
          ))
        )}
      </div>
    </aside>
  )
}
