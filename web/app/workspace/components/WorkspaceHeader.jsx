function greetingForTimeZone(timeZone) {
  const hourStr = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hour12: false,
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date())
  const hour = Number(hourStr)
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function formatDateForTimeZone(timeZone) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date())
}

export default function WorkspaceHeader({ timeZone }) {
  const greeting = greetingForTimeZone(timeZone)
  const dateLabel = formatDateForTimeZone(timeZone)

  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">
          {greeting}
        </h1>
        <p className="mt-1 text-sm font-medium text-foreground/80">{dateLabel}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Your personal command center
        </p>
      </div>
    </div>
  )
}
