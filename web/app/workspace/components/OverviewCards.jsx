import { useNavigate } from 'react-router-dom'
import { CalendarDays, CheckSquare2, Clock3, FileText } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

function formatTime(value, timeZone) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  })
}

function formatShortDate(value, timeZone) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  })
}

const TONES = ['g-yellow', 'g-ink', 'g-gold', 'g-ink']

function StatTile({ tone, icon: Icon, title, onClick, children, loading, error }) {
  const clickable = typeof onClick === 'function'
  const content = (
    <div className={`ws-stat ${tone}`}>
      <div className="ws-stat-top">
        <span className={`ws-chip ${tone}`}>
          <Icon className="ws-icon size-4" aria-hidden="true" />
        </span>
        <span className="ws-stat-label">{title}</span>
      </div>
      {children}
    </div>
  )

  if (!clickable) return <div>{content}</div>
  return (
    <button type="button" className="block w-full text-left" onClick={onClick}>
      {content}
    </button>
  )
}

function MetricSkeleton() {
  return (
    <div className="grid gap-2" aria-hidden="true">
      <Skeleton className="h-8 w-14" />
      <Skeleton className="h-3.5 w-32" />
    </div>
  )
}

export default function OverviewCards({
  calendarLoading,
  calendarError,
  documentsLoading,
  documentsError,
  tasksLoading,
  tasksError,
  timeZone,
  todayCount,
  nextTodayEvent,
  upcomingCount,
  nearestUpcoming,
  documentsTotal,
  activeTasksCount,
  overdueTasksCount,
}) {
  const navigate = useNavigate()
  const today = new Date()
  const y = today.getFullYear()
  const m = String(today.getMonth() + 1).padStart(2, '0')
  const d = String(today.getDate()).padStart(2, '0')
  const todayParam = `${y}-${m}-${d}`

  const nextTodayLabel = (() => {
    if (calendarLoading || calendarError) return null
    if (todayCount === 0) return 'No events today'
    if (!nextTodayEvent) return 'Scheduled today'
    const occ = nextTodayEvent.occurrence
    if (occ?.is_all_day) return 'Next: All-day event'
    const t = formatTime(occ?.start_at, occ?.timezone || timeZone)
    return t ? `Next at ${t}` : 'Upcoming today'
  })()

  const nearestUpcomingLabel = (() => {
    if (calendarLoading || calendarError) return null
    if (upcomingCount === 0 || !nearestUpcoming) return 'No upcoming events'
    const occ = nearestUpcoming.occurrence
    if (occ?.is_all_day) {
      const ds = occ.start_date ? formatShortDate(new Date(`${occ.start_date}T00:00:00`)) : null
      return ds ? `Next: ${ds} · All day` : 'Next: All-day event'
    }
    const when = formatShortDate(occ?.start_at, occ?.timezone || timeZone)
    return when ? `Nearest: ${when}` : 'Upcoming soon'
  })()

  const tasksLabel = (() => {
    if (tasksLoading || tasksError) return null
    if (typeof overdueTasksCount === 'number' && overdueTasksCount > 0) {
      return `${overdueTasksCount} overdue`
    }
    return 'Active tasks'
  })()

  const showDocuments = typeof documentsTotal === 'number'

  return (
    <div className="ws-stats" aria-label="Overview">
      <StatTile
        tone="g-yellow"
        icon={CalendarDays}
        title="Today's Events"
        onClick={() => navigate(`/calendar?view=timeGridDay&date=${todayParam}`)}
      >
        {calendarLoading ? (
          <MetricSkeleton />
        ) : calendarError ? (
          <p className="text-sm text-muted-foreground">Unavailable</p>
        ) : (
          <>
            <div className="ws-stat-num">{todayCount}</div>
            <p className="ws-stat-sub">{nextTodayLabel}</p>
          </>
        )}
      </StatTile>

      <StatTile
        tone="g-ink"
        icon={Clock3}
        title="Upcoming Events"
        onClick={() => navigate('/calendar?view=listMonth')}
      >
        {calendarLoading ? (
          <MetricSkeleton />
        ) : calendarError ? (
          <p className="text-sm text-muted-foreground">Unavailable</p>
        ) : (
          <>
            <div className="ws-stat-num">{upcomingCount}</div>
            <p className="ws-stat-sub">{nearestUpcomingLabel}</p>
          </>
        )}
      </StatTile>

      <StatTile
        tone="g-gold"
        icon={CheckSquare2}
        title="Active Tasks"
        onClick={() => navigate('/tasks')}
      >
        {tasksLoading ? (
          <MetricSkeleton />
        ) : tasksError ? (
          <p className="text-sm text-muted-foreground">Unavailable</p>
        ) : (
          <>
            <div className="ws-stat-num">
              {typeof activeTasksCount === 'number' ? activeTasksCount : '—'}
            </div>
            <p className="ws-stat-sub">{tasksLabel}</p>
          </>
        )}
      </StatTile>

      {showDocuments ? (
        <StatTile
          tone="g-ink"
          icon={FileText}
          title="Documents"
          onClick={() => navigate('/documents')}
        >
          {documentsLoading ? (
            <MetricSkeleton />
          ) : documentsError ? (
            <p className="text-sm text-muted-foreground">Unavailable</p>
          ) : (
            <>
              <div className="ws-stat-num">{documentsTotal}</div>
              <p className="ws-stat-sub">Total documents</p>
            </>
          )}
        </StatTile>
      ) : (
        <StatTile tone="g-ink" icon={FileText} title="Documents">
          <p className="text-sm text-muted-foreground">Count unavailable</p>
        </StatTile>
      )}
    </div>
  )
}