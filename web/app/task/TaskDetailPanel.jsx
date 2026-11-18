import { useEffect, useMemo, useState } from 'react'
import { Calendar, Clock, FileText, Flag, Link2, Pencil, Tag, Trash2, User, Users, X } from 'lucide-react'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import ErrorState from '@/components/shared/ErrorState'
import IconButton from '@/components/shared/IconButton'
import LoadingState from '@/components/shared/LoadingState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet'
import { deleteTask, updateTaskStatus } from './api.js'
import TaskActivitySection from './TaskActivitySection.jsx'
import TaskCommentsSection from './TaskCommentsSection.jsx'
import TaskSubtasksSection from './TaskSubtasksSection.jsx'
import useTaskDetails from './hooks/useTaskDetails.js'
import { TASK_STATUSES } from './utils/taskConstants.js'
import { formatDate, formatDateTime, priorityLabel, statusLabel } from './utils/taskFormat.js'

function DetailRow({ icon: Icon, label, children }) {
  return (
    <div className="grid gap-1">
      <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
        <Icon size={13} aria-hidden="true" />
        {label}
      </dt>
      <dd className="text-[13px] text-foreground">{children}</dd>
    </div>
  )
}

export default function TaskDetailPanel({
  taskId,
  currentUserId,
  refreshKey = 0,
  onClose,
  onEdit,
  onDeleted,
  onOpenTask,
  onUnauthorized,
  onChanged,
}) {
  const details = useTaskDetails({ taskId, onUnauthorized, refreshKey })
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [statusBusy, setStatusBusy] = useState(false)
  const [statusError, setStatusError] = useState('')

  useEffect(() => {
    setDeleteOpen(false)
    setDeleteError('')
    setDeleteBusy(false)
    setStatusBusy(false)
    setStatusError('')
  }, [taskId])

  const task = details.task
  const isOwner = Boolean(task && currentUserId != null && task.created_by === currentUserId)
  const assignments = Array.isArray(task?.assignments) ? task.assignments : []
  const labels = Array.isArray(task?.labels) ? task.labels : []

  const progress = useMemo(() => {
    if (!details.subtasks.length) return null
    const done = details.subtasks.filter((s) => s.status === 'done').length
    return { done, total: details.subtasks.length, pct: Math.round((done / details.subtasks.length) * 100) }
  }, [details.subtasks])

  if (!taskId) return null

  async function handleDelete() {
    setDeleteBusy(true)
    setDeleteError('')
    try {
      await deleteTask(taskId)
      setDeleteOpen(false)
      onDeleted?.()
      onClose()
    } catch (err) {
      if (err?.status === 401) onUnauthorized?.()
      else setDeleteError(err?.message || 'Could not delete the task.')
    } finally {
      setDeleteBusy(false)
    }
  }

  async function handleStatusChange(nextStatus) {
    if (!task || nextStatus === task.status) return
    setStatusBusy(true)
    setStatusError('')
    try {
      await updateTaskStatus(task.id, nextStatus)
      await details.refreshTaskOnly()
      onChanged?.()
    } catch (err) {
      if (err?.status === 401) onUnauthorized?.()
      else setStatusError(err?.message || 'Could not update task status.')
    } finally {
      setStatusBusy(false)
    }
  }

  return (
    <>
      <Sheet open={Boolean(taskId)} onOpenChange={(next) => { if (!next) onClose() }}>
        <SheetContent side="right" className="tasks-sheet flex w-full flex-col gap-0 border-l border-border p-0 sm:max-w-[520px] [&>button]:hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Task</span>
            <IconButton label="Close task details" onClick={onClose}><X size={16} aria-hidden="true" /></IconButton>
          </div>

          <ScrollArea className="flex-1">
            <div className="grid gap-5 px-5 py-4">
              {details.loading && !task ? (
                <LoadingState label="Loading task…" />
              ) : details.error ? (
                <ErrorState title="Could not load task" message={details.error} onRetry={details.reload} />
              ) : task ? (
                <>
                  <div className="grid gap-2">
                    <SheetTitle className="text-lg font-semibold leading-snug tracking-[-0.01em]">{task.title}</SheetTitle>
                    <SheetDescription className="sr-only">Task details</SheetDescription>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="secondary" className="font-medium">{statusLabel(task.status)}</Badge>
                      <Badge variant="outline" className="font-medium">Priority: {priorityLabel(task.priority)}</Badge>
                      {task.parent_task_id && <Badge variant="outline" className="font-medium">Subtask of #{task.parent_task_id}</Badge>}
                    </div>
                  </div>

                  {statusError && <p className="text-[12.5px] text-destructive" role="alert">{statusError}</p>}
                  {details.actionError && <p className="text-[12.5px] text-destructive" role="alert">{details.actionError}</p>}

                  <dl className="grid gap-4">
                    <DetailRow icon={User} label="Creator">
                      {currentUserId != null && task.created_by === currentUserId ? 'You' : `User #${task.created_by}`}
                    </DetailRow>
                    <DetailRow icon={Flag} label="Status">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{statusLabel(task.status)}</span>
                        <div className="flex flex-wrap gap-1">
                          {TASK_STATUSES.map((s) => (
                            <Button key={s.id} type="button" variant={s.id === task.status ? 'default' : 'outline'} size="sm" className="h-7 px-2 text-[11.5px]" disabled={statusBusy || s.id === task.status} onClick={() => handleStatusChange(s.id)}>
                              {s.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                      <p className="mt-1 text-[11.5px] text-muted-foreground">Status changes use the supported status endpoint (backend validates transitions/permissions).</p>
                    </DetailRow>
                    <DetailRow icon={Calendar} label="Dates">
                      <p>Start: {task.start_date ? formatDate(task.start_date) : 'Not set'}</p>
                      <p>Due: {task.due_date ? formatDate(task.due_date) : 'Not set'}</p>
                      {task.completed_at && <p>Completed: {formatDateTime(task.completed_at)}</p>}
                    </DetailRow>
                    <DetailRow icon={Users} label="Assignees">
                      {assignments.length === 0 ? (
                        <p className="text-[12.5px] text-muted-foreground">No assignees.</p>
                      ) : (
                        <ul className="grid gap-1.5">
                          {assignments.map((a) => (
                            <li key={a.id} className="flex items-center justify-between gap-2 rounded-[8px] border border-border px-2.5 py-1.5">
                              <span className="text-[12.5px]">
                                {currentUserId != null && a.assigned_user_id === currentUserId ? 'You' : `User #${a.assigned_user_id}`}
                                <span className="text-muted-foreground"> · {a.assignment_status}</span>
                              </span>
                              {isOwner && a.assignment_status === 'active' && (
                                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11.5px] text-destructive hover:text-destructive" disabled={details.assignmentsBusy} onClick={() => details.removeAssignee(a.assigned_user_id)}>
                                  Remove
                                </Button>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="mt-1 text-[11.5px] text-muted-foreground">
                        Assignment changes are owner-only per backend rules. Adding authorized assignees is not available here because the frontend has no authorized user-directory/lookup API (no user records are invented or exposed).
                      </p>
                    </DetailRow>
                    <DetailRow icon={Tag} label="Labels">
                      {labels.length === 0 ? <p className="text-[12.5px] text-muted-foreground">No labels attached.</p> : (
                        <div className="flex flex-wrap gap-1.5">
                          {labels.map((l) => <Badge key={l.id} variant="secondary">{l.name}</Badge>)}
                        </div>
                      )}
                      {isOwner && details.availableLabels.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {details.availableLabels.map((label) => {
                            const attached = labels.some((l) => l.id === label.id)
                            return (
                              <button key={label.id} type="button" disabled={details.labelsBusy} onClick={() => details.toggleLabel(label.id, attached)} className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[12px] font-medium ${attached ? 'border-foreground/20 bg-foreground text-background' : 'border-border bg-card hover:bg-accent/60'}`} aria-pressed={attached}>
                                {label.name}
                              </button>
                            )
                          })}
                        </div>
                      )}
                      {details.labelsError && <p className="mt-1 text-[12px] text-destructive" role="alert">{details.labelsError}</p>}
                    </DetailRow>
                    <DetailRow icon={FileText} label="Description">
                      {task.description ? <p className="whitespace-pre-wrap">{task.description}</p> : <p className="text-[12.5px] text-muted-foreground">No description.</p>}
                    </DetailRow>
                    <DetailRow icon={Link2} label="Hierarchy">
                      <p>Parent: {details.parentTask ? (
                        <button type="button" className="font-medium underline-offset-2 hover:underline" onClick={() => onOpenTask?.(details.parentTask.id)}>
                          #{details.parentTask.id} {details.parentTask.title}
                        </button>
                      ) : (task.parent_task_id ? `#${task.parent_task_id}` : 'None')}</p>
                      {progress && <p className="text-muted-foreground">Subtask progress: {progress.done}/{progress.total} done ({progress.pct}%)</p>}
                    </DetailRow>
                    <DetailRow icon={Clock} label="Timestamps">
                      <p>Created: {formatDateTime(task.created_at)}</p>
                      <p>Updated: {formatDateTime(task.updated_at)}</p>
                    </DetailRow>
                    <DetailRow icon={FileText} label="Related references">
                      <p className="text-[12.5px] text-muted-foreground">Related document references: not available (no task-document reference API found in current backend contract).</p>
                      <p className="text-[12.5px] text-muted-foreground">Related calendar references: not available (no task-calendar reference API found in current backend contract).</p>
                    </DetailRow>
                  </dl>

                  <Separator />

                  <TaskSubtasksSection
                    task={task}
                    subtasks={details.subtasks}
                    total={details.subtasksTotal}
                    error={details.subtasksError}
                    busy={details.subtasksBusy}
                    onCreate={details.addSubtask}
                    onOpenTask={onOpenTask}
                    canCreate={isOwner}
                  />

                  <Separator />

                  <TaskCommentsSection
                    comments={details.comments}
                    error={details.commentsError}
                    busy={details.commentsBusy}
                    currentUserId={currentUserId}
                    onAdd={details.addComment}
                    onDelete={details.removeComment}
                  />

                  <Separator />

                  <TaskActivitySection activities={details.activities} error={details.activitiesError} />
                </>
              ) : null}
            </div>
          </ScrollArea>

          <div className="flex items-center gap-2 border-t border-border px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
            <Button type="button" variant="outline" className="h-9 flex-1 gap-1.5" onClick={() => onEdit?.(task)} disabled={!task || details.loading}>
              <Pencil size={14} aria-hidden="true" /> Edit
            </Button>
            <Button type="button" variant="ghost" className="h-9 flex-1 gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleteOpen(true)} disabled={!task || details.loading || !isOwner}>
              <Trash2 size={14} aria-hidden="true" /> Delete
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete task"
        description={`Delete “${task?.title || 'this task'}”? This action cannot be undone.`}
        confirmLabel="Delete"
        busyLabel="Deleting…"
        busy={deleteBusy}
        error={deleteError}
        contentClassName="tasks-dialog"
        onConfirm={handleDelete}
        onClose={() => { if (!deleteBusy) { setDeleteOpen(false); setDeleteError('') } }}
      />
    </>
  )
}
