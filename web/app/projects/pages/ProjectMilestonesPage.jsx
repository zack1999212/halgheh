import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { CalendarDays, Flag, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import DialogShell from '@/components/shared/DialogShell'
import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import FormError from '@/components/shared/FormError'
import FormField, { fieldInputClass } from '@/components/shared/FormField'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  createProjectMilestone,
  deleteProjectMilestone,
  listProjectMilestones,
  updateProjectMilestone,
} from '../api.js'
import { formatDateTime, formatProjectDate } from '../utils/projectFormat.js'

const MILESTONE_STATUSES = [
  { id: 'pending', label: 'Pending' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
]

const STATUS_LABEL = Object.fromEntries(MILESTONE_STATUSES.map((s) => [s.id, s.label]))

function statusBadgeClass(status) {
  switch (status) {
    case 'completed':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    case 'in_progress':
      return 'border-blue-200 bg-blue-50 text-blue-700'
    case 'cancelled':
      return 'border-red-200 bg-red-50 text-red-700'
    case 'pending':
    default:
      return 'border-amber-200 bg-amber-50 text-amber-800'
  }
}

function canManageContent(role) {
  return role === 'owner' || role === 'admin' || role === 'editor'
}

function MilestoneDialog({ open, mode, milestone, busy, error, onClose, onSave }) {
  const isEdit = mode === 'edit'
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState('pending')
  const [dueDate, setDueDate] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  useEffect(() => {
    if (!open) return
    if (isEdit && milestone) {
      setTitle(milestone.title || '')
      setDescription(milestone.description || '')
      setStatus(milestone.status || 'pending')
      setDueDate(milestone.due_date || '')
    } else {
      setTitle('')
      setDescription('')
      setStatus('pending')
      setDueDate('')
    }
    setFieldErrors({})
  }, [open, isEdit, milestone])

  function validate() {
    const errs = {}
    const trimmed = title.trim()
    if (!trimmed) errs.title = 'Title is required.'
    else if (trimmed.length > 200) errs.title = 'Title must be 200 characters or fewer.'
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (busy) return
    if (!validate()) return
    const payload = {
      title: title.trim(),
      description: description.trim() ? description.trim() : null,
      status,
      due_date: dueDate || null,
    }
    if (isEdit && milestone) {
      const patch = {}
      if (payload.title !== milestone.title) patch.title = payload.title
      if ((payload.description || null) !== (milestone.description || null)) patch.description = payload.description
      if (payload.status !== milestone.status) patch.status = payload.status
      if ((payload.due_date || null) !== (milestone.due_date || null)) patch.due_date = payload.due_date
      if (Object.keys(patch).length === 0) {
        onClose()
        return
      }
      onSave(patch)
      return
    }
    onSave(payload)
  }

  return (
    <DialogShell
      open={open}
      title={isEdit ? 'Edit milestone' : 'New milestone'}
      description={isEdit ? 'Update milestone details and status.' : 'Create a project milestone. Milestones are independent of tasks and do not affect task progress.'}
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <Button type="button" variant="outline" className="h-9" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" form="milestone-dialog-form" className="h-9" disabled={busy}>
            {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create milestone'}
          </Button>
        </>
      }
    >
      <form id="milestone-dialog-form" className="grid gap-4" onSubmit={handleSubmit}>
        <FormError>{error}</FormError>
        <FormField id="milestone-title" label="Title" error={fieldErrors.title}>
          {(field) => (
            <Input
              {...field}
              className={cn(fieldInputClass, fieldErrors.title && 'border-destructive/40 focus-visible:ring-destructive/30')}
              value={title}
              maxLength={200}
              onChange={(e) => { setTitle(e.target.value); setFieldErrors((s) => ({ ...s, title: '' })) }}
              placeholder="Milestone title"
              disabled={busy}
              autoFocus
            />
          )}
        </FormField>
        <div className="grid gap-2">
          <Label htmlFor="milestone-description" className="text-[13px] font-medium">
            Description <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id="milestone-description"
            className="min-h-[90px] rounded-[var(--radius-md)] px-3 py-2 text-base md:text-[15px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={busy}
            placeholder="Add details about this milestone"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="milestone-status" className="text-[13px] font-medium">Status</Label>
            <Select value={status} onValueChange={setStatus} disabled={busy}>
              <SelectTrigger id="milestone-status" className={fieldInputClass}><SelectValue /></SelectTrigger>
              <SelectContent>
                {MILESTONE_STATUSES.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="milestone-due-date" className="text-[13px] font-medium">Due date <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input
              id="milestone-due-date"
              type="date"
              className={fieldInputClass}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={busy}
            />
          </div>
        </div>
      </form>
    </DialogShell>
  )
}

export default function ProjectMilestonesPage() {
  const { projectId } = useParams()
  const outlet = useOutletContext() || {}
  const role = outlet.role || outlet.project?.current_user_role
  const canManage = canManageContent(role)

  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [limit] = useState(50)
  const [offset, setOffset] = useState(0)

  const [dialog, setDialog] = useState({ open: false, mode: 'create', milestone: null, busy: false, error: '' })
  const [deleteState, setDeleteState] = useState({ open: false, milestone: null, busy: false, error: '' })

  const load = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    setError('')
    try {
      const res = await listProjectMilestones(projectId, { limit, offset })
      setItems(Array.isArray(res?.items) ? res.items : [])
      setTotal(Number.isFinite(res?.total) ? res.total : 0)
    } catch (err) {
      if (err?.status === 401) {
        outlet.onUnauthorized?.()
        return
      }
      setError(err?.message || 'Could not load milestones.')
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [projectId, limit, offset, outlet])

  useEffect(() => {
    load()
  }, [load])

  const canPrev = offset > 0
  const canNext = offset + limit < total
  const pageStart = total === 0 ? 0 : offset + 1
  const pageEnd = Math.min(offset + items.length, total)

  function openCreate() {
    setDialog({ open: true, mode: 'create', milestone: null, busy: false, error: '' })
  }

  function openEdit(milestone) {
    setDialog({ open: true, mode: 'edit', milestone, busy: false, error: '' })
  }

  async function handleSave(payload) {
    if (dialog.busy) return
    setDialog((s) => ({ ...s, busy: true, error: '' }))
    try {
      if (dialog.mode === 'edit' && dialog.milestone) {
        await updateProjectMilestone(projectId, dialog.milestone.id, payload)
      } else {
        await createProjectMilestone(projectId, payload)
        setOffset(0)
      }
      setDialog({ open: false, mode: 'create', milestone: null, busy: false, error: '' })
      await load()
    } catch (err) {
      if (err?.status === 401) {
        outlet.onUnauthorized?.()
        return
      }
      if (err?.status === 403 || err?.status === 404) {
        setDialog((s) => ({ ...s, busy: false, error: err?.message || 'Action not allowed.' }))
      } else {
        setDialog((s) => ({ ...s, busy: false, error: err?.message || 'Could not save the milestone.' }))
      }
    }
  }

  async function handleDelete() {
    const milestone = deleteState.milestone
    if (!milestone || deleteState.busy) return
    setDeleteState((s) => ({ ...s, busy: true, error: '' }))
    try {
      await deleteProjectMilestone(projectId, milestone.id)
      setDeleteState({ open: false, milestone: null, busy: false, error: '' })
      // If deleting the last item on a later page, step back a page.
      if (items.length === 1 && offset > 0) setOffset((o) => Math.max(0, o - limit))
      else await load()
    } catch (err) {
      if (err?.status === 401) {
        outlet.onUnauthorized?.()
        return
      }
      setDeleteState((s) => ({ ...s, busy: false, error: err?.message || 'Could not delete the milestone.' }))
    }
  }

  async function quickStatusUpdate(milestone, nextStatus) {
    if (!canManage || !milestone || milestone.status === nextStatus) return
    try {
      await updateProjectMilestone(projectId, milestone.id, { status: nextStatus })
      await load()
    } catch (err) {
      if (err?.status === 401) {
        outlet.onUnauthorized?.()
        return
      }
      setError(err?.message || 'Could not update milestone status.')
    }
  }

  return (
    <div className="grid gap-4">
      <Card className="project-overview-surface border-[#E5E1D9] shadow-none">
        <CardHeader className="gap-4 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-[20px] font-semibold tracking-[-0.02em] text-foreground">Milestones</CardTitle>
                <Badge variant="secondary" className="font-medium">{total} total</Badge>
              </div>
              <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
                Track key project checkpoints. Milestones are independent records and do not affect task progress.
              </p>
            </div>
            {canManage && (
              <div className="flex shrink-0 items-center gap-2">
                <Button type="button" className="h-9 gap-2" onClick={openCreate}>
                  <Plus size={15} aria-hidden="true" />
                  New milestone
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-5 pt-0 sm:p-6 sm:pt-0">
          {loading ? (
            <div className="grid gap-3" aria-busy="true" aria-label="Loading milestones">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-[#E5E1D9] bg-[#F7F5F1] p-4">
                  <div className="flex items-start gap-3">
                    <Skeleton className="size-10 rounded-xl" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-4 w-48 max-w-full" />
                      <Skeleton className="h-3 w-72 max-w-full" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#E5E1D9] bg-[#F7F5F1] p-8">
              <EmptyState
                icon={Flag}
                title="No milestones yet"
                description={canManage ? 'Create milestones to mark important project checkpoints and due dates.' : 'No milestones have been created for this project yet.'}
              >
                {canManage ? (
                  <Button type="button" className="mt-2 h-9 gap-2" onClick={openCreate}>
                    <Plus size={15} aria-hidden="true" />
                    New milestone
                  </Button>
                ) : null}
              </EmptyState>
            </div>
          ) : (
            <div className="grid gap-3">
              {items.map((milestone) => (
                <article key={milestone.id} className="flex flex-col gap-3 rounded-xl border border-[#E5E1D9] bg-[#F7F5F1] p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-[14px] font-semibold text-foreground">{milestone.title}</h3>
                      <Badge variant="outline" className={cn('font-medium', statusBadgeClass(milestone.status))}>
                        {STATUS_LABEL[milestone.status] || milestone.status}
                      </Badge>
                    </div>
                    {milestone.description ? (
                      <p className="mt-1.5 line-clamp-3 text-[13px] leading-relaxed text-muted-foreground">{milestone.description}</p>
                    ) : (
                      <p className="mt-1.5 text-[13px] text-muted-foreground">No description.</p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays size={13} aria-hidden="true" />
                        Due {formatProjectDate(milestone.due_date) || '—'}
                      </span>
                      {milestone.completed_at ? <span>Completed {formatDateTime(milestone.completed_at)}</span> : null}
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex shrink-0 items-center gap-2 pl-0 sm:pl-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5">
                            <MoreHorizontal size={14} aria-hidden="true" />
                            Manage
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onSelect={() => openEdit(milestone)}>
                            <Pencil size={14} />
                            Edit milestone
                          </DropdownMenuItem>
                          {MILESTONE_STATUSES.filter((s) => s.id !== milestone.status).map((s) => (
                            <DropdownMenuItem key={s.id} onSelect={() => quickStatusUpdate(milestone, s.id)}>
                              <Flag size={14} />
                              Mark as {s.label}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleteState({ open: true, milestone, busy: false, error: '' })}>
                            <Trash2 size={14} />
                            Delete milestone
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </article>
              ))}

              {total > limit && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E5E1D9] pt-3">
                  <p className="text-[12.5px] text-muted-foreground">Showing {pageStart}-{pageEnd} of {total}</p>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setOffset((o) => Math.max(0, o - limit))} disabled={!canPrev || loading}>Previous</Button>
                    <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setOffset((o) => (o + limit < total ? o + limit : o))} disabled={!canNext || loading}>Next</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <MilestoneDialog
        open={dialog.open}
        mode={dialog.mode}
        milestone={dialog.milestone}
        busy={dialog.busy}
        error={dialog.error}
        onClose={() => !dialog.busy && setDialog({ open: false, mode: 'create', milestone: null, busy: false, error: '' })}
        onSave={handleSave}
      />

      <ConfirmDialog
        open={deleteState.open}
        title="Delete milestone"
        description={deleteState.milestone ? `Delete "${deleteState.milestone.title}"? This action cannot be undone.` : 'Delete this milestone?'}
        confirmLabel="Delete milestone"
        busyLabel="Deleting…"
        busy={deleteState.busy}
        error={deleteState.error}
        destructive
        onConfirm={handleDelete}
        onClose={() => !deleteState.busy && setDeleteState({ open: false, milestone: null, busy: false, error: '' })}
      />
    </div>
  )
}
