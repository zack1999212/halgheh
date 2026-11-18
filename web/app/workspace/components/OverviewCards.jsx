import { useNavigate } from 'react-router-dom'
import { CalendarDays, CheckSquare2, Clock3, FileText } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
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

function CardShell({ icon: Icon, title, onClick, children }) {
  const clickable = typeof onClick === 'function'
  const content = (
    <Card className={`ws-card h-full ${clickable ? 'ws-card-interactive' : ''}`}>
      <CardContent className="flex h-full flex-col gap-3 p-4 sm:p-5">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-border/80 bg-muted/30 text-foreground">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <span className="text-sm font-medium text-foreground">{title}</span>
        </div>
        {children}
      </CardContent>
    </Card>
  )

  if (!clickable) return <div className="h-full">{content}</div>

  return (
    <button
      type="button"
      className="block h-full w-full rounded-[16px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      onClick={onClick}
    >
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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <CardShell
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
            <div className="text-3xl font-semibold leading-none tracking-tight text-foreground">
              {todayCount}
            </div>
            <p className="text-xs text-muted-foreground">{nextTodayLabel}</p>
          </>
        )}
      </CardShell>

      <CardShell
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
            <div className="text-3xl font-semibold leading-none tracking-tight text-foreground">
              {upcomingCount}
            </div>
            <p className="text-xs text-muted-foreground">{nearestUpcomingLabel}</p>
          </>
        )}
      </CardShell>

      <CardShell
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
            <div className="text-3xl font-semibold leading-none tracking-tight text-foreground">
              {typeof activeTasksCount === 'number' ? activeTasksCount : '—'}
            </div>
            <p className="text-xs text-muted-foreground">{tasksLabel}</p>
          </>
        )}
      </CardShell>

      {showDocuments ? (
        <CardShell icon={FileText} title="Documents" onClick={() => navigate('/documents')}>
          {documentsLoading ? (
            <MetricSkeleton />
          ) : documentsError ? (
            <p className="text-sm text-muted-foreground">Unavailable</p>
          ) : (
            <>
              <div className="text-3xl font-semibold leading-none tracking-tight text-foreground">
                {documentsTotal}
              </div>
              <p className="text-xs text-muted-foreground">Total documents</p>
            </>
          )}
        </CardShell>
      ) : (
        <CardShell icon={FileText} title="Documents">
          <p className="text-sm text-muted-foreground">Count unavailable</p>
        </CardShell>
      )}
    </div>
  )
}
