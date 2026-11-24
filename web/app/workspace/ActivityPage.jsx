import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Activity as ActivityIcon, Loader2 } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import { clearSession } from '../auth/api.js'
import { formatDateTime, formatRelativeTime } from '../notifications/format.js'
import { useActiveWorkspace } from './ActiveWorkspaceContext.jsx'
import {
  ACTIVITY_FILTERS,
  ACTIVITY_GROUPS,
  activityGroup,
  activityLink,
  activityPhrase,
  actorName,
  resourceName,
} from './activityFormat.js'
import useWorkspaceActivityData from './hooks/useWorkspaceActivityData.js'
import { useWorkspaceTheme } from './hooks/useWorkspaceTheme.js'
import './workspace.css'

function initialsOf(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

function categoryLabel(category) {
  return ACTIVITY_FILTERS.find((filter) => filter.value === category)?.label || 'Activity'
}

function ActivityRecord({ item, showWorkspace }) {
  const link = activityLink(item)
  const name = resourceName(item)

  const body = (
    <>
      <Avatar className="size-10 shrink-0">
        <AvatarFallback className="text-[12px]">{initialsOf(actorName(item))}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] leading-5 text-foreground">
          <span className="font-semibold">{actorName(item)}</span> {activityPhrase(item)}
          {name && <span className="font-medium"> “{name}”</span>}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted-foreground">
          {showWorkspace && item.workspace_name && (
            <Badge variant="secondary" className="px-1.5 py-0 text-[10.5px]">
              {item.workspace_name}
            </Badge>
          )}
          <Badge variant="outline" className="px-1.5 py-0 text-[10.5px]">
            {categoryLabel(item.category)}
          </Badge>
          <time dateTime={item.created_at} title={formatDateTime(item.created_at)}>
            {formatRelativeTime(item.created_at)}
          </time>
          {link && <span className="text-foreground/70">{link.label} →</span>}
        </p>
      </div>
    </>
  )

  return link ? (
    <Link
      to={link.to}
      className="ws-row group flex w-full items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {body}
    </Link>
  ) : (
    <div className="ws-row group flex items-center gap-3">{body}</div>
  )
}

function LoadingList() {
  return (
    <div className="grid gap-2">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 px-3 py-2.5">
          <Skeleton className="size-10 rounded-full" />
          <div className="grid flex-1 gap-1.5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function ActivityPage() {
  const navigate = useNavigate()
  const { theme } = useWorkspaceTheme()
  const {
    activeWorkspace,
    isAllWorkspaces,
    status: workspaceStatus,
  } = useActiveWorkspace()
  const workspaceReady = workspaceStatus === 'ready'

  const handleUnauthorized = () => {
    clearSession()
    navigate('/login', { replace: true })
  }

  const filters = useMemo(
    () => ACTIVITY_FILTERS.filter((filter) => filter.value !== 'milestones'),
    [],
  )
  const [category, setCategory] = useState('')

  const activity = useWorkspaceActivityData({
    workspaceId: !workspaceReady
      ? undefined
      : isAllWorkspaces
        ? null
        : activeWorkspace?.id,
    category,
    limit: 20,
    onUnauthorized: handleUnauthorized,
  })

  const groups = useMemo(() => {
    const result = Object.fromEntries(ACTIVITY_GROUPS.map((group) => [group, []]))
    for (const item of activity.items) {
      const group = activityGroup(item.created_at)
      result[group].push(item)
    }
    return result
  }, [activity.items])

  return (
    <div className="workspace-page" data-theme={theme}>
      <div className="relative z-10 flex flex-col gap-4 sm:gap-5">
        <section className="ws-hero pt-0">
          <h1>Activity</h1>
          <p className="ws-date">
            {isAllWorkspaces ? 'All Workspaces' : activeWorkspace?.name || 'Workspace'}
            {' · '}
            Recent actions by Workspace members.
          </p>
        </section>

        <div className="flex flex-wrap gap-2">
          {filters.map((filter) => (
            <Button
              key={filter.value}
              type="button"
              size="sm"
              variant={category === filter.value ? 'default' : 'outline'}
              className="h-8 rounded-[10px]"
              onClick={() => setCategory(filter.value)}
            >
              {filter.label}
            </Button>
          ))}
        </div>

        <Card className="ws-card min-w-0">
          <CardHeader className="ws-card-head px-4 pb-2 pt-4 sm:px-5 sm:pt-5">
            <CardTitle className="ws-card-title">Activity timeline</CardTitle>
            <span className="text-xs text-muted-foreground">{activity.total} records</span>
          </CardHeader>
          <CardContent className="px-3 pb-4 pt-0 sm:px-4 sm:pb-5">
            {activity.loading && activity.items.length === 0 ? (
              <LoadingList />
            ) : activity.error && activity.items.length === 0 ? (
              <ErrorState
                title="Could not load activity"
                message={activity.error}
                onRetry={activity.reload}
              />
            ) : activity.items.length === 0 ? (
              <EmptyState
                icon={ActivityIcon}
                title="No activity yet"
                description="Actions from Workspace members will appear here."
                className="py-8"
              />
            ) : (
              <div className="grid gap-5">
                {ACTIVITY_GROUPS.map((group) =>
                  groups[group].length > 0 ? (
                    <section key={group}>
                      <h2 className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {group}
                      </h2>
                      <div className="flex flex-col gap-0.5">
                        {groups[group].map((item) => (
                          <ActivityRecord
                            key={item.id}
                            item={item}
                            showWorkspace={isAllWorkspaces}
                          />
                        ))}
                      </div>
                    </section>
                  ) : null,
                )}
                {activity.error && (
                  <ErrorState message={activity.error} onRetry={activity.loadMore} />
                )}
                {activity.hasMore && (
                  <div className="flex justify-center">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 gap-2 rounded-[10px]"
                      onClick={activity.loadMore}
                      disabled={activity.loading}
                    >
                      {activity.loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                      Load more
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}