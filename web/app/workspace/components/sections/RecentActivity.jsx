import { Link } from 'react-router-dom'
import { Activity as ActivityIcon } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import { formatRelativeTime } from '../../../notifications/format.js'
import {
  activityLink,
  activityPhrase,
  actorName,
  resourceName,
} from '../../activityFormat.js'

function initialsOf(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

function ActivityRow({ item, showWorkspace }) {
  const link = activityLink(item)
  const name = resourceName(item)
  const content = (
    <>
      <Avatar className="size-8 shrink-0">
        <AvatarFallback className="text-[11px]">{initialsOf(actorName(item))}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] leading-5 text-foreground">
          <span className="font-semibold">{actorName(item)}</span>{' '}
          {activityPhrase(item)}
          {name && <span className="font-medium"> “{name}”</span>}
        </p>
        <p className="truncate text-[11.5px] text-muted-foreground">
          {showWorkspace && item.workspace_name ? `${item.workspace_name} · ` : ''}
          <time dateTime={item.created_at}>{formatRelativeTime(item.created_at)}</time>
        </p>
      </div>
    </>
  )

  return link ? (
    <Link
      to={link.to}
      className="ws-row group flex w-full items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
    >
      {content}
    </Link>
  ) : (
    <div className="ws-row group flex items-center gap-3">{content}</div>
  )
}

function LoadingList() {
  return (
    <div className="grid gap-1">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 px-2 py-1.5">
          <Skeleton className="size-8 rounded-full" />
          <div className="grid flex-1 gap-1">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function RecentActivity({
  loading,
  error,
  items = [],
  showWorkspace = false,
  onRetry,
}) {
  return (
    <Card className="ws-card min-w-0">
      <CardHeader className="ws-card-head flex flex-row items-center justify-between gap-3 space-y-0 px-4 pb-2 pt-4 sm:px-5 sm:pt-5">
        <CardTitle className="ws-card-title">Recent Activity</CardTitle>
        <Button asChild variant="ghost" size="sm" className="ws-link h-8 rounded-[10px] px-3">
          <Link to="/workspace/activity">View all activity</Link>
        </Button>
      </CardHeader>
      <CardContent className="px-3 pb-4 pt-0 sm:px-4 sm:pb-5">
        {loading ? (
          <LoadingList />
        ) : error ? (
          <ErrorState title="Could not load activity" message={error} onRetry={onRetry} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={ActivityIcon}
            title="No activity yet"
            description="Actions from Workspace members will appear here."
            className="py-4"
          />
        ) : (
          <div className="flex flex-col gap-0.5">
            {items.map((item) => (
              <ActivityRow key={item.id} item={item} showWorkspace={showWorkspace} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}