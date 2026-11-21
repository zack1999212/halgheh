import { CalendarDays, ChevronDown, ExternalLink } from 'lucide-react'
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
import { TASK_STATUSES } from './utils/taskConstants.js'
import { formatDate, isOverdue, priorityLabel, statusLabel } from './utils/taskFormat.js'

function MetaRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-right text-foreground">{value}</span>
    </div>
  )
}

export default function TaskCard({ task, onStatusChange, onOpen, busy = false, compact = false, readOnly = false }) {
  const overdue = isOverdue(task)
  const description = task.description
  const labels = Array.isArray(task.labels) ? task.labels : null
  const assignments = Array.isArray(task.assignments) ? task.assignments : null
  const canChangeStatus = !readOnly && typeof onStatusChange === 'function'

  return (
    <article className={cn('tasks-card flex flex-col gap-3 p-3', compact && 'p-2.5')}>
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          onClick={() => onOpen?.(task.id)}
          aria-label={`Open task ${task.title}`}
        >
          <h3 className="truncate text-[13.5px] font-semibold tracking-[-0.01em] text-foreground hover:underline" title={task.title}>
            {task.title}
          </h3>
          <p className={cn('mt-1 text-[12.5px] leading-relaxed text-muted-foreground', compact ? 'line-clamp-2' : 'line-clamp-3')}>
            {description ? description : 'Open task details for full information (list response is summary-only).'}
          </p>
        </button>
        <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => onOpen?.(task.id)} aria-label={`Open details for ${task.title}`}>
          <ExternalLink size={14} aria-hidden="true" />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary" className="px-1.5 py-0 text-[10.5px] font-medium">{statusLabel(task.status)}</Badge>
        <Badge variant="outline" className="px-1.5 py-0 text-[10.5px] font-medium">Priority: {priorityLabel(task.priority)}</Badge>
        {overdue && <Badge variant="destructive" className="px-1.5 py-0 text-[10.5px] font-medium">Overdue</Badge>}
        {task.parent_task_id && <Badge variant="outline" className="px-1.5 py-0 text-[10.5px] font-medium">Subtask</Badge>}
      </div>

      <div className="grid gap-1.5">
        <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <CalendarDays size={13} aria-hidden="true" />
          <span>{task.due_date ? `Due ${formatDate(task.due_date)}` : 'No due date'}</span>
        </div>
        <MetaRow label="Assignees" value={assignments ? (assignments.length ? `${assignments.length} assigned` : 'Unassigned') : 'In details'} />
        <MetaRow label="Labels" value={labels ? (labels.length ? labels.map((l) => l.name).join(', ') : 'No labels') : 'In details'} />
        <MetaRow label="Subtasks" value={task.subtask_progress || 'In details'} />
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
        <span className="text-[11px] text-muted-foreground">ID #{task.id}</span>
        {canChangeStatus ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-[12.5px]" disabled={busy} aria-label={`Change status for ${task.title}`}>
                Status <ChevronDown size={14} aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">Set status</DropdownMenuLabel>
              {TASK_STATUSES.map((s) => (
                <DropdownMenuItem key={s.id} disabled={s.id === task.status} onSelect={() => onStatusChange?.(task, s.id)}>
                  {s.label}{s.id === task.status ? ' (current)' : ''}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className="text-[11.5px] text-muted-foreground">View only</span>
        )}
      </div>
    </article>
  )
}
