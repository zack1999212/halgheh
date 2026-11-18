import { CheckSquare2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
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

function statusInfo(task, todayStr) {
  const status = String(task?.status || task?.state || '').toLowerCase()
  const completed = task?.completed === true || task?.is_completed === true || status === 'completed' || status === 'done'
  if (completed) return { label: 'Completed', tone: 'text-muted-foreground' }
  if (status === 'cancelled' || status === 'canceled') return { label: 'Cancelled', tone: 'text-muted-foreground' }
  const due = task?.due_date || task?.date
  if (typeof due === 'string' && due.slice(0, 10) < todayStr) return { label: 'Overdue', tone: 'text-red-700' }
  return { label: 'Active', tone: 'text-foreground/80' }
}

function formatWhen(task) {
  if (task?.due_at || task?.start_at) {
    const d = new Date(task.due_at || task.start_at)
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    }
  }
  if (typeof task?.due_date === 'string') return 'Due today'
  return 'Today'
}

function TaskRow({ task, todayStr }) {
  const title = task?.title || task?.name || 'Untitled task'
  const when = formatWhen(task)
  const priority = labelForPriority(task?.priority)
  const st = statusInfo(task, todayStr)
  const completed = st.label === 'Completed'

  return (
    <div className="ws-row flex w-full items-start gap-3 px-3 py-2.5">
      <span
        className={`mt-1.5 size-2.5 shrink-0 rounded-full ring-1 ring-black/5 ${st.label === 'Overdue' ? 'bg-red-500' : completed ? 'bg-muted-foreground/50' : 'bg-foreground/70'}`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-semibold leading-5 ${completed ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
          {title}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {[when, priority].filter(Boolean).join(' · ')}
        </p>
      </div>
      <span className={`shrink-0 text-[11px] font-medium ${st.tone}`}>{st.label}</span>
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

export default function TodayTasks({ loading, error, items = [], todayStr, onRetry }) {
  return (
    <Card className="ws-card ws-card-primary min-w-0">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 px-4 pb-2 pt-4 sm:px-5 sm:pt-5">
        <CardTitle className="text-base font-semibold">Today&apos;s Tasks</CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-4 pt-0 sm:px-4 sm:pb-5">
        {loading ? (
          <LoadingList />
        ) : error ? (
          <ErrorState title="Could not load today’s tasks" message={error} onRetry={onRetry} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={CheckSquare2}
            title="No tasks for today"
            description="Tasks due today will appear here when available."
            className="py-4"
          />
        ) : (
          <div className="flex flex-col gap-0.5">
            {items.map((task, idx) => (
              <TaskRow key={task?.id ?? idx} task={task} todayStr={todayStr} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
