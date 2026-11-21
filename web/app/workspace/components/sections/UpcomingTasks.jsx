import { ListChecks } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'

function labelForPriority(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  if (!Number.isNaN(n)) {
    if (n >= 3) return 'High'
    if (n === 2) return 'Medium'
    if (n <= 1) return 'Low'
  }
  const s = String(value)
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : null
}

function formatDate(task) {
  const raw = task?.due_date || task?.date || task?.start_date
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const d = new Date(`${raw.slice(0, 10)}T00:00:00`)
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    }
  }
  const ts = task?.due_at || task?.start_at
  if (typeof ts === 'string') {
    const d = new Date(ts)
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    }
  }
  return 'Scheduled'
}

function TaskRow({ task }) {
  const title = task?.title || task?.name || 'Untitled task'
  const date = formatDate(task)
  const priority = labelForPriority(task?.priority)
  const status = String(task?.status || task?.state || 'active')
  const statusLabel = status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Active'

  return (
    <div className="ws-row flex w-full items-start gap-3 px-3 py-2.5">
      <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-foreground/70 ring-1 ring-black/5" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-5 text-foreground">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{[date, priority].filter(Boolean).join(' · ')}</p>
      </div>
      <span className="shrink-0 text-[11px] font-medium text-foreground/80">{statusLabel}</span>
    </div>
  )
}

function LoadingList() {
  return (
    <div className="grid gap-1">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5">
          <Skeleton className="size-2.5 rounded-full" />
          <div className="grid flex-1 gap-1">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-4 w-14" />
        </div>
      ))}
    </div>
  )
}

export default function UpcomingTasks({ loading, error, items = [], onRetry }) {
  return (
    <Card className="ws-card min-w-0">
      <CardHeader className="ws-card-head flex flex-row items-center justify-between gap-3 space-y-0 px-4 pb-2 pt-4 sm:px-5 sm:pt-5">
        <CardTitle className="ws-card-title">Upcoming Tasks</CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-4 pt-0 sm:px-4 sm:pb-5">
        {loading ? (
          <LoadingList />
        ) : error ? (
          <ErrorState title="Could not load upcoming tasks" message={error} onRetry={onRetry} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="No upcoming tasks"
            description="Active tasks scheduled in the next seven days will appear here."
            className="py-4"
          />
        ) : (
          <div className="flex flex-col gap-0.5">
            {items.map((task, idx) => (
              <TaskRow key={task?.id ?? idx} task={task} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
