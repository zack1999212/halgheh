import { useNavigate } from 'react-router-dom'
import { CalendarClock, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import { categoryOf } from '../../../calendar/categories.js'

function localDateString(date = new Date()) {
  const pad = (v) => String(v).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function addDaysStr(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  const pad = (v) => String(v).padStart(2, '0')
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}

function relativeLabel(occurrence, timeZone) {
  const today = localDateString(new Date())
  const tomorrow = addDaysStr(today, 1)
  let dateStr = null
  if (occurrence?.is_all_day) {
    dateStr = occurrence.start_date || null
  } else if (occurrence?.start_at) {
    const d = new Date(occurrence.start_at)
    if (!Number.isNaN(d.getTime())) {
      const pad = (v) => String(v).padStart(2, '0')
      dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    }
  }
  if (dateStr === today) return 'Today'
  if (dateStr === tomorrow) return 'Tomorrow'
  return null
}

function formatDate(occurrence, timeZone) {
  if (!occurrence) return ''
  if (occurrence.is_all_day) {
    const d = occurrence.start_date ? new Date(`${occurrence.start_date}T00:00:00`) : null
    return d && !Number.isNaN(d.getTime())
      ? d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
      : ''
  }
  const tz = occurrence.timezone || timeZone
  const d = occurrence.start_at ? new Date(occurrence.start_at) : null
  if (!d || Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(tz ? { timeZone: tz } : {}),
  })
}

function formatTimeRange(occurrence, timeZone) {
  if (!occurrence || occurrence.is_all_day) return 'All day'
  const tz = occurrence.timezone || timeZone
  const opts = { hour: 'numeric', minute: '2-digit', ...(tz ? { timeZone: tz } : {}) }
  const start = occurrence.start_at ? new Date(occurrence.start_at) : null
  const end = occurrence.end_at ? new Date(occurrence.end_at) : null
  if (!start || Number.isNaN(start.getTime())) return ''
  const s = start.toLocaleTimeString(undefined, opts)
  if (!end || Number.isNaN(end.getTime())) return s
  return `${s} – ${end.toLocaleTimeString(undefined, opts)}`
}

function EventRow({ item, timeZone, onOpen }) {
  const occ = item.occurrence
  const cat = categoryOf(occ?.category)
  const rel = relativeLabel(occ, timeZone)
  const dateLabel = formatDate(occ, timeZone)
  const timeLabel = formatTimeRange(occ, timeZone)
  return (
    <button
      type="button"
      className="ws-row group flex w-full items-center gap-3 px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
      onClick={() => onOpen(item)}
    >
      <span
        className="size-2.5 shrink-0 rounded-full ring-1 ring-black/5"
        style={{ backgroundColor: cat?.accent || 'hsl(var(--muted-foreground))' }}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-semibold leading-5 text-foreground">
            {occ?.title || 'Untitled event'}
          </p>
          {rel && (
            <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {rel}
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">{dateLabel}</p>
      </div>
      <div className="shrink-0 text-right">
        {occ?.is_all_day ? (
          <span className="rounded-md border border-border bg-muted/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            All day
          </span>
        ) : (
          <span className="text-xs font-medium tabular-nums text-foreground/80">{timeLabel}</span>
        )}
      </div>
    </button>
  )
}

function LoadingList() {
  return (
    <div className="grid gap-1">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-1.5">
          <Skeleton className="size-2.5 rounded-full" />
          <div className="grid flex-1 gap-1">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  )
}

export default function UpcomingEvents({
  loading,
  error,
  items = [],
  timeZone,
  onRetry,
  onOpenEvent,
  onCreateEvent,
}) {
  const navigate = useNavigate()

  return (
    <Card className="ws-card min-w-0">
      <CardHeader className="ws-card-head flex flex-row items-center justify-between gap-3 space-y-0 px-4 pb-2 pt-4 sm:px-5 sm:pt-5">
        <CardTitle className="ws-card-title">Upcoming Events</CardTitle>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ws-link h-8 rounded-[10px] px-3"
          onClick={() => navigate('/calendar?view=listMonth')}
        >
          View Calendar
        </Button>
      </CardHeader>
      <CardContent className="px-3 pb-4 pt-0 sm:px-4 sm:pb-5">
        {loading ? (
          <LoadingList />
        ) : error ? (
          <ErrorState
            title="Could not load upcoming events"
            message={error}
            onRetry={onRetry}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No upcoming events"
            description="Nothing scheduled in the next seven days."
            className="py-4"
          >
            {onCreateEvent && (
              <Button type="button" size="sm" className="ws-btn mt-1 h-9 gap-1.5 rounded-[10px]" onClick={onCreateEvent}>
                <Plus className="size-4" aria-hidden="true" />
                Create Event
              </Button>
            )}
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-0.5">
            {items.map((item, idx) => (
              <EventRow
                key={`${item.occurrence?.event_id}-${item.occurrence?.original_start_at || item.occurrence?.original_start_date || idx}`}
                item={item}
                timeZone={timeZone}
                onOpen={onOpenEvent}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
