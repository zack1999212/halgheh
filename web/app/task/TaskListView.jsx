import { CalendarDays, ChevronDown, MoreHorizontal, Trash2 } from 'lucide-react'
import LoadingState from '@/components/shared/LoadingState'
import ErrorState from '@/components/shared/ErrorState'
import EmptyState from '@/components/shared/EmptyState'
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
import { TASK_PRIORITIES, TASK_STATUSES } from './utils/taskConstants.js'
import { formatDate, isOverdue, priorityLabel, statusLabel } from './utils/taskFormat.js'

function PriorityBadge({ priority }) {
  const variant = priority === 'urgent' ? 'destructive' : 'outline'
  const className =
    priority === 'high'
      ? 'border-foreground/25 bg-muted/40 text-foreground'
      : priority === 'low'
        ? 'text-muted-foreground'
        : ''
  return (
    <Badge variant={variant} className={cn('px-1.5 py-0 text-[10.5px] font-medium', className)}>
      {priorityLabel(priority)}
    </Badge>
  )
}

export default function TaskListView({
  items,
  loading,
  error,
  onRetry,
  onStatusChange,
  onPriorityChange,
  onDelete,
  onOpen,
  isStatusPending,
  selectedTaskId = null,
  readOnly = false,
  emptyTitle = 'No tasks found',
  emptyDescription = 'Try adjusting filters or create a new task.',
  activeWorkspaceId = null,
}) {
  if (loading) {
    return <div className="p-2"><LoadingState label="Loading tasks…" /></div>
  }
  if (error) {
    return <ErrorState title="Could not load tasks" message={error} onRetry={onRetry} />
  }
  if (!items.length) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        className="py-10"
      />
    )
  }

  return (
    <div className="tasks-list shrink-0 rounded-[var(--radius-lg)] border border-border bg-card" aria-label="Task list">
      <div className="tasks-list-head hidden md:grid">
        <div>Task</div>
        <div>Status</div>
        <div>Priority</div>
        <div>Due date</div>
        <div>Assignees / Labels</div>
        <div className="text-right">Action</div>
      </div>

      <ul className="divide-y divide-border/80">
        {items.map((task) => {
          const overdue = isOverdue(task)
          const busy = typeof isStatusPending === 'function' ? isStatusPending(task.id) : false
          const selected = selectedTaskId === task.id
          const assignments = Array.isArray(task.assignments) ? task.assignments : null
          const labels = Array.isArray(task.labels) ? task.labels : null

          return (
            <li key={task.id}>
              <div
                className={cn(
                  'tasks-list-row grid gap-3 px-3 py-3 transition-colors hover:bg-accent/20 md:items-center md:px-4',
                  selected && 'bg-accent/25',
                  overdue && 'bg-destructive/[0.02]',
                )}
              >
                <div className="min-w-0">
                  <button
                    type="button"
                    className="block w-full rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => onOpen?.(task.id)}
                    aria-label={`Open task ${task.title}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold tracking-[-0.01em] text-foreground" title={task.title}>
                        {task.title}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">
                      <span>ID #{task.id}</span>
                      {Number(task.checklist_total || 0) > 0 ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="inline-block h-1.5 w-14 overflow-hidden rounded-full bg-muted align-middle" aria-hidden="true">
                            <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round((Number(task.checklist_completed || 0) / Number(task.checklist_total || 0)) * 100)}%` }} />
                          </span>
                          <span>{Number(task.checklist_completed || 0)}/{Number(task.checklist_total || 0)} completed — {Math.round((Number(task.checklist_completed || 0) / Number(task.checklist_total || 0)) * 100)}%</span>
                        </span>
                      ) : null}
                    </div>
                  </button>
                </div>

                <div className="flex items-center gap-2 md:block">
                  <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted-foreground md:hidden">Status</span>
                  <Badge variant="secondary" className="px-1.5 py-0 text-[10.5px] font-medium">
                    {statusLabel(task.status)}
                  </Badge>
                </div>

                <div className="flex items-center gap-2 md:block">
                  <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted-foreground md:hidden">Priority</span>
                  <PriorityBadge priority={task.priority} />
                </div>

                <div className="flex items-center gap-2 md:block">
                  <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted-foreground md:hidden">Due</span>
                  <div className={cn('inline-flex items-center gap-1.5 text-[12.5px]', overdue ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                    <CalendarDays size={13} aria-hidden="true" className="shrink-0" />
                    <span>{task.due_date ? formatDate(task.due_date) : 'No due date'}</span>
                    {overdue && <Badge variant="destructive" className="px-1.5 py-0 text-[10px] font-semibold">Overdue</Badge>}
                  </div>
                </div>

                <div className="min-w-0">
                  <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.05em] text-muted-foreground md:hidden">Assignees / Labels</span>
                  <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
                    <span>{assignments ? (assignments.length ? `${assignments.length} assigned` : 'Unassigned') : '—'}</span>
                    <span aria-hidden="true">·</span>
                    <span className="truncate" title={labels ? labels.map((l) => l.name).join(', ') : ''}>
                      {labels ? (labels.length ? labels.map((l) => l.name).join(', ') : 'No labels') : '—'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap justify-end gap-1.5 sm:flex-nowrap">
                  {!readOnly ? (
                    <>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 min-w-[96px] flex-1 gap-1 bg-background text-[12.5px] sm:flex-none"
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
                            className="h-8 min-w-[96px] flex-1 gap-1 bg-background text-[12.5px] sm:flex-none"
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
                            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                            disabled={busy}
                            aria-label={`More actions for ${task.title}`}
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
                    </>
                  ) : null}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
