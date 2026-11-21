import { useMemo, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { Activity } from 'lucide-react'
import { cn } from '@/lib/utils'
import ProjectActivityFeed from '../components/ProjectActivityFeed.jsx'
import useProjectActivity from '../hooks/useProjectActivity.js'
import { ACTIVITY_FILTERS } from '../utils/activityConfig.js'

export default function ProjectActivityPage() {
  const { projectId } = useParams()
  const outlet = useOutletContext() || {}
  const [activeFilter, setActiveFilter] = useState('all')

  const selectedFilter = useMemo(
    () => ACTIVITY_FILTERS.find((f) => f.id === activeFilter) || ACTIVITY_FILTERS[0],
    [activeFilter],
  )

  const activity = useProjectActivity({
    projectId,
    eventTypes: selectedFilter.eventTypes,
    limit: 20,
    enabled: Boolean(projectId),
    onUnauthorized: outlet.onUnauthorized,
  })

  const handleRetry = () => activity.reload()
  const totalCount = Number.isFinite(activity.total) ? activity.total : 0

  return (
    <div className="project-3d-page" aria-label="Project activity">
      <section className="project-3d-panel">
        <div className="project-3d-panel-header">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <p className="project-3d-eyebrow">Project Feed</p>
              <div className="mt-2 flex items-center gap-3">
                <span className="project-3d-icon-badge" aria-hidden="true">
                  <Activity size={18} strokeWidth={2.1} />
                </span>
                <h2 className="text-[28px] font-semibold tracking-[-0.03em] text-[#191919] sm:text-[32px]">
                  Activity
                </h2>
              </div>
              <p className="mt-3 max-w-3xl text-[14px] leading-relaxed text-[#6B665F] sm:text-[15px]">
                A chronological history of meaningful changes across tasks, documents, milestones, members, and calendar events in this project.
              </p>
            </div>

            <div className="project-3d-stat shrink-0 self-start lg:self-auto" aria-label={`Total events: ${totalCount}`}>
              <span className="project-3d-stat-value">{totalCount.toLocaleString()}</span>
              <span className="project-3d-stat-label">Total events</span>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Activity filters">
            {ACTIVITY_FILTERS.map((filter) => {
              const active = filter.id === activeFilter
              return (
                <button
                  key={filter.id}
                  type="button"
                  className="project-3d-filter"
                  data-active={active ? 'true' : 'false'}
                  aria-pressed={active}
                  onClick={() => setActiveFilter(filter.id)}
                >
                  {filter.label}
                </button>
              )
            })}
          </div>
        </div>
      </section>

      <section className="project-3d-panel" aria-label="Activity timeline">
        <div className="project-3d-panel-body">
          <ProjectActivityFeed
            projectId={projectId}
            items={activity.items}
            loading={activity.loading}
            loadingMore={activity.loadingMore}
            error={activity.error}
            hasMore={activity.hasMore}
            onLoadMore={activity.loadMore}
            onRetry={handleRetry}
            emptyTitle={activeFilter === 'all' ? 'No activity yet' : `No ${selectedFilter.label.toLowerCase()} activity`}
            emptyDescription={
              activeFilter === 'all'
                ? 'Meaningful project changes will appear here as your team works.'
                : 'Try another filter or check back after new activity happens.'
            }
          />
        </div>
      </section>
    </div>
  )
}
