import { CALENDAR_VIEWS } from './views.js'

/**
 * 3D Pop segmented view switcher.
 *
 * A single pill sits on the white calendar card: the active view is a yellow
 * gradient tab with a soft glow, the inactive labels are muted. Kept as a
 * tablist so the current view is announced to assistive tech, with roving
 * focus and arrow-key support.
 */
export default function CalendarViewSelector({ view, onChange }) {
  function handleKeyDown(event) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return
    }
    event.preventDefault()
    const currentIndex = CALENDAR_VIEWS.findIndex((option) => option.id === view)
    const direction = event.key === 'ArrowRight' ? 1 : -1
    const nextIndex =
      (currentIndex + direction + CALENDAR_VIEWS.length) % CALENDAR_VIEWS.length
    onChange(CALENDAR_VIEWS[nextIndex].id)
  }

  return (
    <div
      role="tablist"
      aria-label="Calendar view"
      className="cal-seg"
      onKeyDown={handleKeyDown}
    >
      {CALENDAR_VIEWS.map((option) => {
        const active = view === option.id
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            className={active ? 'cal-seg-btn is-active' : 'cal-seg-btn'}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
