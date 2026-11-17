import {
  Check,
  ChevronDown,
  LoaderCircle,
  Plus,
  RefreshCw,
  Settings2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

/**
 * Calendar switcher. Loading, error and empty states stay inline in the
 * toolbar; the populated state is a shadcn DropdownMenu that keeps each
 * calendar's own colour dot (calendars are colour-coded separately from the
 * monochrome interface).
 */
export default function CalendarSelector({
  calendars = [],
  selectedId = null,
  loading = false,
  error = '',
  onSelect,
  onRetry,
  onCreate,
  onManage,
}) {
  if (loading) {
    return (
      <div className="inline-flex h-8 items-center gap-2 rounded-[var(--radius-md)] border border-border bg-card px-2.5 text-[12.5px] text-muted-foreground">
        <LoaderCircle
          size={14}
          className="animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
        <span>Loading calendars…</span>
      </div>
    )
  }

  if (error) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={onRetry}
        title={error}
      >
        <RefreshCw size={14} aria-hidden="true" />
        Calendars unavailable
      </Button>
    )
  }

  if (calendars.length === 0) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5"
        onClick={onCreate}
        title="Create your first calendar"
      >
        <Plus size={14} aria-hidden="true" />
        Create calendar
      </Button>
    )
  }

  const selected =
    calendars.find((calendar) => calendar.id === selectedId) || null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 max-w-[220px] gap-2"
          aria-label="Select calendar"
        >
          <span
            className="size-2.5 shrink-0 rounded-full border border-black/10"
            style={selected?.color ? { background: selected.color } : undefined}
            aria-hidden="true"
          />
          <span className="truncate">{selected?.name || 'Select calendar'}</span>
          <ChevronDown size={14} className="opacity-50" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-[248px]">
        <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
          Calendars
        </DropdownMenuLabel>

        {calendars.map((calendar) => (
          <DropdownMenuItem
            key={calendar.id}
            onSelect={() => onSelect?.(calendar.id)}
            className="gap-2"
          >
            <span
              className="size-2.5 shrink-0 rounded-full border border-black/10"
              style={calendar.color ? { background: calendar.color } : undefined}
              aria-hidden="true"
            />
            <span className="truncate">{calendar.name}</span>
            {calendar.is_default && (
              <Badge
                variant="secondary"
                className="ml-auto px-1.5 py-0 text-[10px] font-medium"
              >
                Default
              </Badge>
            )}
            {calendar.id === selectedId && (
              <Check
                className={cn('size-4 shrink-0', !calendar.is_default && 'ml-auto')}
                aria-hidden="true"
              />
            )}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={() => onCreate?.()} className="gap-2">
          <Plus size={14} aria-hidden="true" />
          New calendar
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onManage?.()} className="gap-2">
          <Settings2 size={14} aria-hidden="true" />
          Manage
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
