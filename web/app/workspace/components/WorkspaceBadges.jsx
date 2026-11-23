import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export default function WorkspaceBadges({ workspaces, activeWorkspaceId = null, max = 2, className = '' }) {
  const items = Array.isArray(workspaces) ? workspaces : []
  if (items.length === 0) return null

  const visible = items.slice(0, max)
  const remaining = items.length - visible.length

  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {visible.map((ws) => {
        const active = activeWorkspaceId != null && ws.id === activeWorkspaceId
        return (
          <Badge
            key={ws.id}
            variant="outline"
            className={cn(
              'max-w-[140px] truncate rounded-full px-1.5 py-0 text-[10px] font-medium leading-4',
              active ? 'border-foreground/20 text-foreground' : 'text-muted-foreground',
            )}
            title={ws.name}
          >
            {ws.name}
          </Badge>
        )
      })}
      {remaining > 0 ? (
        <Badge variant="outline" className="rounded-full px-1.5 py-0 text-[10px] font-medium leading-4 text-muted-foreground">
          +{remaining}
        </Badge>
      ) : null}
    </div>
  )
}
