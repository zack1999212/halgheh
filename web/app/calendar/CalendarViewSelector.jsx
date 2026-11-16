import { CALENDAR_VIEWS } from './views.js'

export default function CalendarViewSelector({ view, onChange }) {
  return (
    <div className="view-selector" role="group" aria-label="Calendar view">
      {CALENDAR_VIEWS.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`view-selector-button${view === option.id ? ' is-active' : ''}`}
          aria-pressed={view === option.id}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
