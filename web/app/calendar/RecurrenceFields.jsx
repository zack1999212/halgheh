import { FREQUENCY_OPTIONS, WEEKDAYS } from './recurrence.js'

export default function RecurrenceFields({
  value,
  onChange,
  isAllDay,
  disabled = false,
  error = '',
}) {
  function update(partial) {
    onChange({ ...value, ...partial })
  }

  function toggleDay(code) {
    const next = value.byDay.includes(code)
      ? value.byDay.filter((day) => day !== code)
      : [...value.byDay, code]
    update({ byDay: next })
  }

  const unit = {
    DAILY: 'day',
    WEEKLY: 'week',
    MONTHLY: 'month',
    YEARLY: 'year',
  }[value.frequency]

  return (
    <div className="form-section">
      <h3 className="form-section-title">Repeat</h3>

      <div className="form-row">
        <div className="form-field">
          <label className="form-label" htmlFor="event-frequency">
            Frequency
          </label>
          <select
            id="event-frequency"
            className="form-select"
            value={value.frequency}
            disabled={disabled}
            onChange={(event) =>
              update({
                frequency: event.target.value,
                byDay:
                  event.target.value === 'WEEKLY' && value.byDay.length === 0
                    ? []
                    : value.byDay,
              })
            }
          >
            {FREQUENCY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {value.frequency && (
          <div className="form-field form-field--narrow">
            <label className="form-label" htmlFor="event-interval">
              Every
            </label>
            <div className="form-inline">
              <input
                id="event-interval"
                className="form-input"
                type="number"
                min="1"
                max="99"
                value={value.interval}
                disabled={disabled}
                onChange={(event) =>
                  update({ interval: event.target.value })
                }
              />
              <span className="form-inline-suffix">
                {unit}
                {Number(value.interval) === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        )}
      </div>

      {value.frequency === 'WEEKLY' && (
        <div className="form-field">
          <span className="form-label">On</span>
          <div className="weekday-picker">
            {WEEKDAYS.map((day) => (
              <button
                key={day.code}
                type="button"
                className={`weekday-button${value.byDay.includes(day.code) ? ' is-active' : ''}`}
                aria-pressed={value.byDay.includes(day.code)}
                disabled={disabled}
                onClick={() => toggleDay(day.code)}
              >
                {day.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {value.frequency && (
        <div className="form-field">
          <span className="form-label">Ends</span>
          <div className="radio-row">
            <label className="radio-option">
              <input
                type="radio"
                name="recurrence-end"
                checked={value.endMode === 'never'}
                disabled={disabled}
                onChange={() => update({ endMode: 'never' })}
              />
              Never
            </label>
            <label className="radio-option">
              <input
                type="radio"
                name="recurrence-end"
                checked={value.endMode === 'until'}
                disabled={disabled}
                onChange={() => update({ endMode: 'until' })}
              />
              On date
            </label>
            <label className="radio-option">
              <input
                type="radio"
                name="recurrence-end"
                checked={value.endMode === 'count'}
                disabled={disabled}
                onChange={() => update({ endMode: 'count' })}
              />
              After
            </label>
          </div>

          {value.endMode === 'until' && (
            <input
              type="date"
              className="form-input form-input--inline"
              value={value.untilDate}
              disabled={disabled}
              onChange={(event) => update({ untilDate: event.target.value })}
              aria-label="Repeat until date"
            />
          )}

          {value.endMode === 'count' && (
            <div className="form-inline form-input--inline">
              <input
                type="number"
                min="1"
                className="form-input"
                value={value.count}
                disabled={disabled}
                onChange={(event) => update({ count: event.target.value })}
                aria-label="Number of occurrences"
              />
              <span className="form-inline-suffix">times</span>
            </div>
          )}
        </div>
      )}

      {error && <p className="form-error">{error}</p>}
      {value.frequency && (
        <p className="form-hint">
          Rules are stored as RFC 5545 RRULEs
          {isAllDay ? ' using date-only UNTIL values' : ''}.
        </p>
      )}
    </div>
  )
}
