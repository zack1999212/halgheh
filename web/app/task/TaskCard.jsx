import { CalendarDays, ChevronDown, ExternalLink, MoreHorizontal, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import WorkspaceBadges from '../workspace/components/WorkspaceBadges.jsx'
import { TASK_PRIORITIES, TASK_STATUSES } from './utils/taskConstants.js'
import { formatDate, isOverdue, priorityLabel, statusLabel } from './utils/taskFormat.js'

function MetaRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[12px] leading-5">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right font-medium text-foreground/90" title={value}>
        {value}
      </span>
    </div>
  )
}

export default function TaskCard({
  task,
  onStatusChange,
  onPriorityChange,
  onDelete,
  onOpen,
  busy = false,
  compact = false,
  draggable = false,
  isDragging = false,
  onDragStart,
  onDragEnd,
  onPointerDown,
  dataTaskId,
  readOnly = false,
  activeWorkspaceId = null,
}) {
  const overdue = isOverdue(task)
  const description = task.description
  const labels = Array.isArray(task.labels) ? task.labels : null
  const assignments = Array.isArray(task.assignments) ? task.assignments : null
  const dueText = task.due_date ? `Due ${formatDate(task.due_date)}` : 'No due date'
  const canMutate = !readOnly

  const priority = task.priority
  const priorityVariant = priority === 'urgent' ? 'destructive' : 'outline'
  const priorityClassName =
    priority === 'high'
      ? 'border-foreground/25 bg-muted/40 text-foreground'
      : priority === 'low'
        ? 'text-muted-foreground'
        : ''

  function handleDragStart(event) {
    if (!draggable || busy || onPointerDown) {
      event.preventDefault()
      return
    }
    const interactive = event.target?.closest?.(
      'button, a, input, select, textarea, [role="menuitem"], [data-no-card-drag="true"]',
    )
    if (interactive) {
      event.preventDefault()
      return
    }
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(task.id))
    onDragStart?.(task, event)
  }

  function handleDragEnd(event) {
    onDragEnd?.(task, event)
  }

  return (
    <article
      data-task-card-id={dataTaskId ?? task.id}
      draggable={draggable && !busy && !onPointerDown && canMutate}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onPointerDown={canMutate ? onPointerDown : undefined}
      className={cn(
        'tasks-card group flex flex-col gap-3 p-3',
        compact && 'gap-2.5 p-2.5',
        overdue && 'border-destructive/35 ring-1 ring-destructive/15',
        draggable && !busy && canMutate && 'cursor-grab active:cursor-grabbing',
        isDragging && 'opacity-60 ring-2 ring-foreground/20 select-none',
      )}
      aria-grabbed={draggable ? (isDragging ? 'true' : 'false') : undefined}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="min-w-0 flex-1 rounded-sm text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          onClick={() => onOpen?.(task.id)}
          aria-label={`Open task ${task.title}`}
        >
          <h3
            className="line-clamp-2 text-[13.5px] font-semibold leading-snug tracking-[-0.01em] text-foreground transition-colors group-hover:text-foreground"
            title={task.title}
          >
            {task.title}
          </h3>
          <p
            className={cn(
              'mt-1 text-[12.5px] leading-relaxed text-muted-foreground',
              compact ? 'line-clamp-2' : 'line-clamp-3'
            )}
          >
            {description ? description : 'Open task details for full information (list response is summary-only).'}
          </p>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => onOpen?.(task.id)}
          aria-label={`Open details for ${task.title}`}
        >
          <ExternalLink size={14} aria-hidden="true" />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge
          variant="secondary"
          className="px-1.5 py-0 text-[10.5px] font-medium"
          title="Status"
        >
          {statusLabel(task.status)}
        </Badge>
        <Badge
          variant={priorityVariant}
          className={cn('px-1.5 py-0 text-[10.5px] font-medium', priorityClassName)}
          title="Priority"
        >
          Priority: {priorityLabel(task.priority)}
        </Badge>
        {overdue && (
          <Badge variant="destructive" className="px-1.5 py-0 text-[10.5px] font-semibold">
            Overdue
          </Badge>
        )}
      </div>
      <WorkspaceBadges workspaces={task.workspaces} activeWorkspaceId={activeWorkspaceId} />

      <div className="grid gap-1.5">
        <div
          className={cn(
            'flex items-center gap-1.5 text-[12px]',
            overdue ? 'font-medium text-destructive' : 'text-muted-foreground'
          )}
        >
          <CalendarDays size={13} aria-hidden="true" className="shrink-0" />
          <span>{dueText}</span>
        </div>
        <MetaRow
          label="Assignees"
          value={assignments ? (assignments.length ? `${assignments.length} assigned` : 'Unassigned') : 'In details'}
        />
        <MetaRow
          label="Labels"
          value={labels ? (labels.length ? labels.map((l) => l.name).join(', ') : 'No labels') : 'In details'}
        />
        {Number(task.checklist_total || 0) > 0 ? (
          <div className="grid gap-1" aria-label="Checklist progress">
            <div className="flex items-center justify-between gap-2 text-[11.5px] text-muted-foreground">
              <span>Checklist</span>
              <span className="font-medium text-foreground/85">
                {Number(task.checklist_completed || 0)}/{Number(task.checklist_total || 0)} · {Math.round((Number(task.checklist_completed || 0) / Number(task.checklist_total || 0)) * 100)}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${Math.round((Number(task.checklist_completed || 0) / Number(task.checklist_total || 0)) * 100)}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border/80 pt-2">
        <span className="text-[11px] font-medium text-muted-foreground">ID #{task.id}</span>
        {canMutate ? (
          <div className="flex items-center gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 bg-background text-[12.5px]"
                  disabled={busy}
                  aria-label={`Change priority for ${task.title}`}
                >
                  Priority <ChevronDown size={14} aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  Set priority
                </DropdownMenuLabel>
                {TASK_PRIORITIES.map((p) => (
                  <DropdownMenuItem
                    key={p.id}
                    disabled={p.id === task.priority}
                    onSelect={() => onPriorityChange?.(task, p.id)}
                  >
                    {p.label}
                    {p.id === task.priority ? ' (current)' : ''}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 bg-background text-[12.5px]"
                  disabled={busy}
                  aria-label={`Change status for ${task.title}`}
                >
                  Status <ChevronDown size={14} aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  Set status
                </DropdownMenuLabel>
                {TASK_STATUSES.map((s) => (
                  <DropdownMenuItem
                    key={s.id}
                    disabled={s.id === task.status}
                    onSelect={() => onStatusChange?.(task, s.id)}
                  >
                    {s.label}
                    {s.id === task.status ? ' (current)' : ''}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  disabled={busy}
                  aria-label={`More actions for ${task.title}`}
                  data-no-card-drag="true"
                >
                  <MoreHorizontal size={15} aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => onDelete?.(task)}
                >
                  <Trash2 size={14} aria-hidden="true" className="mr-2" /> Delete task
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <span className="text-[11.5px] text-muted-foreground">View only</span>
        )}
      </div>
    </article>
  )
}
