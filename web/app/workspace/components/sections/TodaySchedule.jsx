import { useNavigate } from 'react-router-dom'
import { Calendar, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import { categoryOf } from '../../../calendar/categories.js'

function formatRange(occurrence, timeZone) {
  if (!occurrence) return ''
  if (occurrence.is_all_day) return 'All day'
  const tz = occurrence.timezone || timeZone
  const opts = { hour: 'numeric', minute: '2-digit', ...(tz ? { timeZone: tz } : {}) }
  const start = occurrence.start_at ? new Date(occurrence.start_at) : null
  const end = occurrence.end_at ? new Date(occurrence.end_at) : null
  if (!start || Number.isNaN(start.getTime())) return ''
  const s = start.toLocaleTimeString(undefined, opts)
  if (!end || Number.isNaN(end.getTime())) return s
  const e = end.toLocaleTimeString(undefined, opts)
  return `${s} – ${e}`
}

function EventRow({ item, timeZone, onOpen }) {
  const occ = item.occurrence
  const cat = categoryOf(occ?.category)
  const timeLabel = formatRange(occ, timeZone)
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
        <p className="truncate text-sm font-semibold leading-5 text-foreground">
          {occ?.title || 'Untitled event'}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {item.calendar?.name || 'Calendar'}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
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

export default function TodaySchedule({
  loading,
  error,
  items = [],
  timeZone,
  onRetry,
  onOpenEvent,
  onCreateEvent,
}) {
  const navigate = useNavigate()
  const today = new Date()
  const todayParam = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  return (
    <Card className="ws-card ws-card-primary min-w-0">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 px-4 pb-2 pt-4 sm:px-5 sm:pt-5">
        <CardTitle className="text-base font-semibold">Today&apos;s Schedule</CardTitle>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ws-btn h-8 rounded-[10px] px-3 text-muted-foreground"
          onClick={() => navigate(`/calendar?view=timeGridDay&date=${todayParam}`)}
        >
          View Calendar
        </Button>
      </CardHeader>
      <CardContent className="px-3 pb-4 pt-0 sm:px-4 sm:pb-5">
        {loading ? (
          <LoadingList />
        ) : error ? (
          <ErrorState
            title="Could not load today’s schedule"
            message={error}
            onRetry={onRetry}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title="No events today"
            description="Your schedule is clear for today."
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
