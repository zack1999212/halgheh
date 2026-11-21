function formatDateForTimeZone(timeZone) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date())
}

function greetingForHour(hour) {
  if (hour < 5) return 'Good evening'
  if (hour < 12) return null
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export default function WorkspaceHeader({ timeZone, theme, onToggleTheme }) {
  const now = new Date()
  const greeting = greetingForHour(now.getHours())
  const dateLabel = formatDateForTimeZone(timeZone)

  return (
    <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <section className="ws-hero">
        {greeting && <h1>{greeting}</h1>}
        <p className="ws-date">{dateLabel}</p>
      </section>
      {typeof onToggleTheme === 'function' && (
        <button
          type="button"
          className="ws-theme-btn shrink-0"
          onClick={onToggleTheme}
          aria-label="Toggle dark mode"
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      )}
    </div>
  )
}