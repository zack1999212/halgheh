import { useEffect, useRef, useState } from 'react'
import {
  Calendar,
  Check,
  ChevronDown,
  LoaderCircle,
  Plus,
  RefreshCw,
  Settings2,
} from 'lucide-react'

export default function CalendarSelector({
  calendars = [],
  selectedId = null,
  loading = false,
  error = '',
  onSelect,
  onRetry,
  onCreate,
  onManage,
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    if (!open) {
      return undefined
    }

    function handlePointerDown(event) {
      if (!containerRef.current?.contains(event.target)) {
        setOpen(false)
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  if (loading) {
    return (
      <div className="calendar-selector calendar-selector--empty">
        <LoaderCircle size={14} className="calendar-spinner" aria-hidden="true" />
        <span>Loading calendars…</span>
      </div>
    )
  }

  if (error) {
    return (
      <button
        type="button"
        className="calendar-selector calendar-selector--error"
        onClick={onRetry}
        title={error}
      >
        <RefreshCw size={14} aria-hidden="true" />
        <span>Calendars unavailable</span>
      </button>
    )
  }

  if (calendars.length === 0) {
    return (
      <button
        type="button"
        className="calendar-selector"
        onClick={onCreate}
        title="Create your first calendar"
      >
        <Plus size={14} aria-hidden="true" />
        <span>Create calendar</span>
      </button>
    )
  }

  const selected =
    calendars.find((calendar) => calendar.id === selectedId) || null

  function handleSelect(calendarId) {
    onSelect?.(calendarId)
    setOpen(false)
  }

  return (
    <div className="calendar-selector-wrap" ref={containerRef}>
      <button
        type="button"
        className={`calendar-selector${open ? ' is-open' : ''}`}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span
          className="calendar-selector-dot"
          style={selected?.color ? { background: selected.color } : undefined}
          aria-hidden="true"
        />
        <span className="calendar-selector-label">
          {selected?.name || 'Select calendar'}
        </span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>

      {open && (
        <div className="calendar-selector-panel">
          <div role="listbox" aria-label="Calendars">
            {calendars.map((calendar) => (
              <button
                key={calendar.id}
                type="button"
                role="option"
                aria-selected={calendar.id === selectedId}
                className="calendar-selector-option"
                onClick={() => handleSelect(calendar.id)}
              >
                <span
                  className="calendar-selector-dot"
                  style={
                    calendar.color ? { background: calendar.color } : undefined
                  }
                  aria-hidden="true"
                />
                <span className="calendar-selector-option-label">
                  {calendar.name}
                </span>
                {calendar.is_default && (
                  <span className="calendar-selector-default">Default</span>
                )}
                {calendar.id === selectedId && (
                  <Check size={14} aria-hidden="true" />
                )}
              </button>
            ))}
          </div>

          <div className="calendar-selector-footer">
            <button
              type="button"
              className="calendar-selector-footer-button"
              onClick={() => {
                setOpen(false)
                onCreate?.()
              }}
            >
              <Plus size={13} aria-hidden="true" />
              New calendar
            </button>
            <button
              type="button"
              className="calendar-selector-footer-button"
              onClick={() => {
                setOpen(false)
                onManage?.()
              }}
            >
              <Settings2 size={13} aria-hidden="true" />
              Manage
            </button>
          </div>
        </div>
      )}
    </div>
  )
}