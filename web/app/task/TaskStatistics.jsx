import { BarChart3 } from 'lucide-react'
import LoadingState from '@/components/shared/LoadingState'
import ErrorState from '@/components/shared/ErrorState'

function Stat({ label, value }) {
  return (
    <div className="rounded-[10px] border border-border bg-card px-3 py-2 shadow-sm">
      <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-[15px] font-semibold tracking-[-0.01em]">{value}</div>
    </div>
  )
}

export default function TaskStatistics({ statistics, loading, error, onRetry }) {
  if (loading && !statistics) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-border bg-card p-4">
        <LoadingState label="Loading statistics…" />
      </div>
    )
  }

  if (error && !statistics) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-border bg-card p-4">
        <ErrorState title="Statistics unavailable" message={error} onRetry={onRetry} />
      </div>
    )
  }

  if (!statistics) return null

  return (
    <section aria-label="Task statistics" className="grid gap-3">
      <div className="flex items-center gap-2 text-[13px] font-semibold">
        <BarChart3 size={15} aria-hidden="true" className="text-muted-foreground" />
        Overview
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Total" value={statistics.total ?? 0} />
        <Stat label="Open" value={statistics.open ?? 0} />
        <Stat label="Completed" value={statistics.completed ?? 0} />
        <Stat label="Overdue" value={statistics.overdue ?? 0} />
        <Stat label="Due today" value={statistics.due_today ?? 0} />
        <Stat label="Completion" value={`${Math.round((statistics.completion_rate ?? 0) * 100)}%`} />
      </div>
      {error && (
        <p className="text-[12px] text-muted-foreground">Statistics may be out of date: {error}</p>
      )}
    </section>
  )
}
