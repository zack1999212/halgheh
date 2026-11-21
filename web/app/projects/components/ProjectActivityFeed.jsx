import { useMemo } from 'react'
import { Activity } from 'lucide-react'
import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import ProjectActivityItem from './ProjectActivityItem.jsx'

function dayKey(value) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 'unknown'
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dayLabel(value) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 'Unknown date'
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((startToday - startDay) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function LoadingSkeleton({ count = 4, compact = false }) {
  return (
    <div className={compact ? 'grid gap-3' : 'grid gap-4'} aria-busy="true" aria-label="Loading activity">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={compact ? 'flex items-start gap-3' : 'flex items-start gap-4'}>
          <Skeleton className={compact ? 'size-8 rounded-lg' : 'mt-1 size-[14px] rounded-full'} />
          <div className="min-w-0 flex-1">
            <Skeleton className={compact ? 'h-16 w-full rounded-xl' : 'h-[76px] w-full rounded-2xl'} />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function ProjectActivityFeed({
  projectId,
  items = [],
  loading,
  loadingMore,
  error,
  hasMore,
  onLoadMore,
  onRetry,
  compact = false,
  emptyTitle = 'No activity yet',
  emptyDescription = 'Meaningful project changes will appear here as your team works.',
}) {
  const groups = useMemo(() => {
    const out = []
    const byKey = new Map()
    for (const item of items) {
      const key = dayKey(item?.created_at)
      if (!byKey.has(key)) {
        const group = { key, label: dayLabel(item?.created_at), items: [] }
        byKey.set(key, group)
        out.push(group)
      }
      byKey.get(key).items.push(item)
    }
    return out
  }, [items])

  if (loading && items.length === 0) {
    return <LoadingSkeleton count={compact ? 3 : 5} compact={compact} />
  }

  if (error && items.length === 0) {
    return <ErrorState message={error} onRetry={onRetry} />
  }

  if (!items.length) {
    return (
      <div className={compact ? 'py-2' : 'rounded-2xl border border-dashed border-[#E7E1D8] bg-[#F7F5F1] p-6 sm:p-8'}>
        <EmptyState icon={Activity} title={emptyTitle} description={emptyDescription} />
      </div>
    )
  }

  return (
    <div className={compact ? 'grid' : 'grid gap-8'}>
      {groups.map((group) => (
        <section key={group.key} aria-label={group.label} className={compact ? '' : 'grid gap-4'}>
          {compact ? (
            <p className="px-1 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {group.label}
            </p>
          ) : (
            <div className="flex items-center gap-4">
              <h3 className="shrink-0 text-[13px] font-semibold tracking-[-0.01em] text-[#191919] sm:text-[14px]">
                {group.label}
              </h3>
              <div className="project-3d-date-divider" aria-hidden="true" />
            </div>
          )}

          <div className={compact ? 'divide-y divide-[#E7E1D8]' : 'grid gap-3'}>
            {group.items.map((item) => (
              <ProjectActivityItem
                key={item.id}
                activity={item}
                projectId={projectId}
                compact={compact}
              />
            ))}
          </div>
        </section>
      ))}

      {error && items.length > 0 ? (
        <div className="pt-1">
          <ErrorState message={error} onRetry={onRetry} />
        </div>
      ) : null}

      {loadingMore ? <LoadingSkeleton count={2} compact={compact} /> : null}

      {hasMore ? (
        <div className={compact ? 'pt-3' : 'flex justify-center pt-2'}>
          <Button
            type="button"
            variant="outline"
            onClick={onLoadMore}
            disabled={loadingMore}
            className={compact
              ? 'h-8 w-full border-[#E7E1D8] bg-white text-[#5F5A51] hover:bg-[#F7F5F1] hover:text-[#191919]'
              : 'h-10 min-w-[160px] rounded-xl border-[#E7E1D8] bg-white px-5 text-[#5F5A51] shadow-[0_1px_2px_rgba(25,25,25,0.03)] hover:bg-[#F7F5F1] hover:text-[#191919]'}
          >
            {loadingMore ? 'Loading…' : 'Load more activity'}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
