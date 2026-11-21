import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Flag,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Target,
  Trash2,
} from 'lucide-react'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import DialogShell from '@/components/shared/DialogShell'
import ErrorState from '@/components/shared/ErrorState'
import FormError from '@/components/shared/FormError'
import FormField, { fieldInputClass } from '@/components/shared/FormField'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  completeProjectMilestoneStep,
  createProjectMilestone,
  createProjectMilestoneStep,
  deleteProjectMilestone,
  deleteProjectMilestoneStep,
  listProjectMilestones,
  reorderProjectMilestones,
  reorderProjectMilestoneSteps,
  reopenProjectMilestoneStep,
  updateProjectMilestone,
  updateProjectMilestoneStep,
} from '../api.js'
import { formatProjectDate } from '../utils/projectFormat.js'

const MAX_PAGE_SIZE = 100

function canManageMilestones(role) {
  return role === 'owner' || role === 'admin' || role === 'editor'
}

function getMilestoneSteps(milestone) {
  return Array.isArray(milestone?.steps) ? milestone.steps : []
}

function getFirstIncompleteStep(steps) {
  return steps.find((step) => !step.is_completed) || null
}

function getStepState(step, steps) {
  if (step?.is_completed) return 'completed'
  const current = getFirstIncompleteStep(steps)
  if (current && current.id === step.id) return 'current'
  return 'upcoming'
}

function getMilestoneUiState(milestone) {
  if (!milestone) return 'upcoming'
  if (milestone.status === 'completed') return 'completed'
  if (milestone.status === 'cancelled') return 'cancelled'
  if (milestone.status === 'in_progress') return 'current'
  const steps = getMilestoneSteps(milestone)
  const firstIncomplete = getFirstIncompleteStep(steps)
  if (steps.length > 0 && firstIncomplete && firstIncomplete.id !== steps[0]?.id) return 'current'
  if ((milestone.completed_steps || 0) > 0) return 'current'
  return 'upcoming'
}

function milestoneStatusLabel(milestone) {
  const state = getMilestoneUiState(milestone)
  if (state === 'completed') return 'Completed'
  if (state === 'cancelled') return 'Cancelled'
  if (state === 'current') return 'Active'
  return 'Upcoming'
}

function normalizeDueDate(value) {
  if (!value) return ''
  if (typeof value === 'string') return value.slice(0, 10)
  return ''
}

function toApiDueDate(value) {
  const trimmed = String(value || '').trim()
  return trimmed ? trimmed : null
}

function ProgressTrack({ progress = 0, complete = false, large = false, className }) {
  const safe = Math.max(0, Math.min(100, Number(progress) || 0))
  return (
    <div className={cn('pm-progress-track', large && 'lg', className)} aria-hidden="true">
      <div className={cn('pm-progress-fill', complete && 'is-complete')} style={{ width: `${safe}%` }} />
    </div>
  )
}

function RoadmapNode({ state, index }) {
  return (
    <span className={cn('pm-roadmap-node', `is-${state}`)} aria-hidden="true">
      {state === 'completed' ? <Check size={13} strokeWidth={3} /> : index + 1}
    </span>
  )
}

function StepIndicator({ state, number }) {
  return (
    <span className={cn('pm-step-indicator', `is-${state}`)} aria-hidden="true">
      {state === 'completed' ? <Check size={13} strokeWidth={3} /> : number}
    </span>
  )
}

function MilestoneFormDialog({
  open,
  mode,
  initialMilestone,
  busy,
  error,
  onClose,
  onSubmit,
}) {
  const isCreate = mode === 'create'
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [initialSteps, setInitialSteps] = useState([])
  const [fieldErrors, setFieldErrors] = useState({})

  useEffect(() => {
    if (!open) return
    setTitle(initialMilestone?.title || '')
    setDescription(initialMilestone?.description || '')
    setDueDate(normalizeDueDate(initialMilestone?.due_date))
    setInitialSteps([])
    setFieldErrors({})
  }, [open, initialMilestone])

  function addInitialStep() {
    setInitialSteps((prev) => [...prev, { key: `${Date.now()}-${Math.random()}`, title: '', description: '' }])
  }

  function updateInitialStep(key, patch) {
    setInitialSteps((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)))
  }

  function removeInitialStep(key) {
    setInitialSteps((prev) => prev.filter((s) => s.key !== key))
  }

  function moveInitialStep(index, delta) {
    setInitialSteps((prev) => {
      const next = [...prev]
      const target = index + delta
      if (target < 0 || target >= next.length) return prev
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next
    })
  }

  function validate() {
    const errs = {}
    const trimmedTitle = title.trim()
    if (!trimmedTitle) errs.title = 'Title is required.'
    const cleanedSteps = initialSteps.map((s) => ({ ...s, title: s.title.trim(), description: s.description.trim() }))
    if (isCreate) {
      cleanedSteps.forEach((s, idx) => {
        if (!s.title) errs[`step-${idx}`] = 'Step title is required.'
      })
    }
    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) return null
    const payload = {
      title: trimmedTitle,
      description: description.trim() || null,
      due_date: toApiDueDate(dueDate),
    }
    if (isCreate) {
      payload.steps = cleanedSteps.map((s) => ({
        title: s.title,
        description: s.description || null,
      }))
    }
    return payload
  }

  function handleSubmit(e) {
    e?.preventDefault?.()
    if (busy) return
    const payload = validate()
    if (!payload) return
    onSubmit(payload)
  }

  return (
    <DialogShell
      open={open}
      title={isCreate ? 'Create milestone' : 'Edit milestone'}
      description={isCreate ? 'Define a major project achievement and optionally map its initial journey steps.' : 'Update milestone details. Progress and status are calculated from milestone steps.'}
      onClose={busy ? () => {} : onClose}
      wide
      footer={
        <>
          <Button type="button" variant="outline" className="h-9" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" className="h-9" onClick={handleSubmit} disabled={busy}>
            {busy ? (isCreate ? 'Creating…' : 'Saving…') : (isCreate ? 'Create milestone' : 'Save changes')}
          </Button>
        </>
      }
    >
      <form className="grid gap-5" onSubmit={handleSubmit}>
        <FormError>{error}</FormError>

        <FormField id="milestone-title" label="Title" required error={fieldErrors.title}>
          {(field) => (
            <Input
              {...field}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={fieldInputClass}
              placeholder="e.g. Launch MVP"
              maxLength={200}
              disabled={busy}
            />
          )}
        </FormField>

        <FormField id="milestone-description" label="Description" hint="Optional context for this destination milestone.">
          {(field) => (
            <Textarea
              {...field}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[96px]"
              placeholder="What does achieving this milestone mean for the project?"
              maxLength={5000}
              disabled={busy}
            />
          )}
        </FormField>

        <FormField id="milestone-due-date" label="Target date" hint="Optional target date for this milestone.">
          {(field) => (
            <Input
              {...field}
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={fieldInputClass}
              disabled={busy}
            />
          )}
        </FormField>

        {isCreate && (
          <div className="grid gap-3 rounded-xl border border-[#E5E1D9] bg-[#F7F5F1] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[13px] font-semibold text-[#242321]">Initial steps</p>
                <p className="text-[12.5px] text-[#6F675B]">Optional ordered journey steps. Milestones without steps start at 0% progress.</p>
              </div>
              <Button type="button" variant="outline" className="h-8 bg-white" onClick={addInitialStep} disabled={busy}>
                <Plus size={14} /> Add step
              </Button>
            </div>

            {initialSteps.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[#D8D2C6] bg-white/70 px-4 py-4 text-[13px] text-[#6F675B]">
                No initial steps yet. You can create the milestone now and add the first step from its detail view.
              </div>
            ) : (
              <div className="grid gap-3">
                {initialSteps.map((step, index) => (
                  <div key={step.key} className="grid gap-3 rounded-lg border border-[#E5E1D9] bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[#8A857C]">Step {index + 1}</p>
                      <div className="flex items-center gap-1">
                        <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => moveInitialStep(index, -1)} disabled={busy || index === 0} aria-label="Move initial step up">
                          <ArrowUp size={14} />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => moveInitialStep(index, 1)} disabled={busy || index === initialSteps.length - 1} aria-label="Move initial step down">
                          <ArrowDown size={14} />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive" onClick={() => removeInitialStep(step.key)} disabled={busy} aria-label="Remove initial step">
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor={`initial-step-title-${step.key}`} className="text-[12.5px]">Title</Label>
                      <Input
                        id={`initial-step-title-${step.key}`}
                        value={step.title}
                        onChange={(e) => updateInitialStep(step.key, { title: e.target.value })}
                        className={fieldInputClass}
                        placeholder="Step title"
                        maxLength={200}
                        disabled={busy}
                      />
                      {fieldErrors[`step-${index}`] ? <p className="text-[12px] text-destructive">{fieldErrors[`step-${index}`]}</p> : null}
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor={`initial-step-desc-${step.key}`} className="text-[12.5px]">Description <span className="font-normal text-muted-foreground">(optional)</span></Label>
                      <Textarea
                        id={`initial-step-desc-${step.key}`}
                        value={step.description}
                        onChange={(e) => updateInitialStep(step.key, { description: e.target.value })}
                        className="min-h-[72px]"
                        placeholder="Optional details"
                        maxLength={5000}
                        disabled={busy}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </form>
    </DialogShell>
  )
}

function StepFormDialog({ open, mode, initialStep, busy, error, onClose, onSubmit }) {
  const isCreate = mode === 'create'
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  useEffect(() => {
    if (!open) return
    setTitle(initialStep?.title || '')
    setDescription(initialStep?.description || '')
    setFieldErrors({})
  }, [open, initialStep])

  function handleSubmit(e) {
    e?.preventDefault?.()
    if (busy) return
    const errs = {}
    const trimmedTitle = title.trim()
    if (!trimmedTitle) errs.title = 'Step title is required.'
    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) return
    onSubmit({ title: trimmedTitle, description: description.trim() || null })
  }

  return (
    <DialogShell
      open={open}
      title={isCreate ? 'Add step' : 'Edit step'}
      description={isCreate ? 'Add an ordered step to this milestone journey.' : 'Update the step details. Progress and current step are derived from completion data.'}
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <Button type="button" variant="outline" className="h-9" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="button" className="h-9" onClick={handleSubmit} disabled={busy}>
            {busy ? (isCreate ? 'Adding…' : 'Saving…') : (isCreate ? 'Add step' : 'Save changes')}
          </Button>
        </>
      }
    >
      <form className="grid gap-4" onSubmit={handleSubmit}>
        <FormError>{error}</FormError>
        <FormField id="step-title" label="Title" required error={fieldErrors.title}>
          {(field) => (
            <Input {...field} value={title} onChange={(e) => setTitle(e.target.value)} className={fieldInputClass} placeholder="Step title" maxLength={200} disabled={busy} />
          )}
        </FormField>
        <FormField id="step-description" label="Description" hint="Optional details for this step.">
          {(field) => (
            <Textarea {...field} value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[88px]" placeholder="Optional description" maxLength={5000} disabled={busy} />
          )}
        </FormField>
      </form>
    </DialogShell>
  )
}

export default function ProjectMilestonesPage() {
  const { projectId } = useParams()
  const { role } = useOutletContext() || {}
  const canManage = canManageMilestones(role)

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [successMessage, setSuccessMessage] = useState('')
  const successTimerRef = useRef(null)

  const [milestoneDialog, setMilestoneDialog] = useState({ open: false, mode: 'create', milestone: null, busy: false, error: '' })
  const [stepDialog, setStepDialog] = useState({ open: false, mode: 'create', milestoneId: null, step: null, busy: false, error: '' })
  const [confirmState, setConfirmState] = useState({ open: false, type: null, milestone: null, step: null, busy: false, error: '' })
  const [actionBusy, setActionBusy] = useState({})

  const busyKey = (kind, ...ids) => `${kind}:${ids.join(':')}`
  const isBusy = (kind, ...ids) => Boolean(actionBusy[busyKey(kind, ...ids)])

  const setBusy = (kind, ids, value) => {
    const key = busyKey(kind, ...ids)
    setActionBusy((prev) => {
      const next = { ...prev }
      if (value) next[key] = true
      else delete next[key]
      return next
    })
  }

  const showSuccess = useCallback((message) => {
    setSuccessMessage(message)
    if (successTimerRef.current) window.clearTimeout(successTimerRef.current)
    successTimerRef.current = window.setTimeout(() => setSuccessMessage(''), 4200)
  }, [])

  useEffect(() => () => {
    if (successTimerRef.current) window.clearTimeout(successTimerRef.current)
  }, [])

  const load = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    setError('')
    try {
      const data = await listProjectMilestones(projectId, { limit: MAX_PAGE_SIZE, offset: 0 })
      const list = Array.isArray(data?.items) ? data.items : []
      setItems(list)
      setSelectedId((prev) => {
        if (prev && list.some((m) => m.id === prev)) return prev
        return list[0]?.id ?? null
      })
    } catch (err) {
      setError(err?.message || 'Could not load milestones.')
      setItems([])
      setSelectedId(null)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    load()
  }, [load])

  const selectedMilestone = useMemo(
    () => items.find((m) => m.id === selectedId) || null,
    [items, selectedId],
  )

  function replaceMilestone(updated) {
    if (!updated) return
    setItems((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
  }

  async function handleMilestoneSubmit(payload) {
    const isCreate = milestoneDialog.mode === 'create'
    setMilestoneDialog((s) => ({ ...s, busy: true, error: '' }))
    try {
      if (isCreate) {
        const created = await createProjectMilestone(projectId, payload)
        setItems((prev) => [...prev, created].sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || (a.id - b.id)))
        setSelectedId(created.id)
        showSuccess('Milestone created. Define its steps to start tracking progress.')
      } else {
        const updated = await updateProjectMilestone(projectId, milestoneDialog.milestone.id, payload)
        replaceMilestone(updated)
        showSuccess('Milestone updated.')
      }
      setMilestoneDialog({ open: false, mode: 'create', milestone: null, busy: false, error: '' })
    } catch (err) {
      setMilestoneDialog((s) => ({ ...s, busy: false, error: err?.message || 'Could not save the milestone.' }))
    }
  }

  async function handleConfirmDelete() {
    const { type, milestone, step } = confirmState
    if (!type) return
    setConfirmState((s) => ({ ...s, busy: true, error: '' }))
    try {
      if (type === 'milestone' && milestone) {
        await deleteProjectMilestone(projectId, milestone.id)
        setItems((prev) => {
          const next = prev.filter((m) => m.id !== milestone.id)
          setSelectedId((sid) => (sid === milestone.id ? (next[0]?.id ?? null) : sid))
          return next
        })
        showSuccess('Milestone deleted.')
      }
      if (type === 'step' && milestone && step) {
        const updated = await deleteProjectMilestoneStep(projectId, milestone.id, step.id)
        replaceMilestone(updated)
        const nextCurrent = getFirstIncompleteStep(getMilestoneSteps(updated))
        if (getMilestoneUiState(updated) === 'completed') {
          showSuccess('Step deleted. All remaining steps are complete.')
        } else if (nextCurrent) {
          showSuccess('Step deleted. Current step recalculated from the updated journey.')
        } else {
          showSuccess('Step deleted. Milestone progress updated.')
        }
      }
      setConfirmState({ open: false, type: null, milestone: null, step: null, busy: false, error: '' })
    } catch (err) {
      setConfirmState((s) => ({ ...s, busy: false, error: err?.message || 'Could not complete this action.' }))
    }
  }

  async function handleStepSubmit(payload) {
    const { mode, milestoneId, step } = stepDialog
    if (!milestoneId) return
    setStepDialog((s) => ({ ...s, busy: true, error: '' }))
    try {
      let updated
      if (mode === 'create') {
        updated = await createProjectMilestoneStep(projectId, milestoneId, payload)
      } else {
        updated = await updateProjectMilestoneStep(projectId, milestoneId, step.id, payload)
      }
      replaceMilestone(updated)
      setSelectedId(updated.id)
      setStepDialog({ open: false, mode: 'create', milestoneId: null, step: null, busy: false, error: '' })
      showSuccess(mode === 'create' ? 'Step added to the milestone journey.' : 'Step updated.')
    } catch (err) {
      setStepDialog((s) => ({ ...s, busy: false, error: err?.message || 'Could not save the step.' }))
    }
  }

  async function handleCompleteStep(milestone, step) {
    if (!canManage || !step || step.is_completed || isBusy('step-toggle', step.id)) return
    setBusy('step-toggle', [step.id], true)
    try {
      const updated = await completeProjectMilestoneStep(projectId, milestone.id, step.id)
      replaceMilestone(updated)
      const next = getFirstIncompleteStep(getMilestoneSteps(updated))
      if (getMilestoneUiState(updated) === 'completed') {
        showSuccess('Step completed. Milestone reached 100% completion.')
      } else if (next) {
        showSuccess(`Step completed. Advanced to "${next.title}" as the current step.`)
      } else {
        showSuccess('Step completed. Progress updated.')
      }
    } catch (err) {
      setError(err?.message || 'Could not complete the step.')
    } finally {
      setBusy('step-toggle', [step.id], false)
    }
  }

  async function handleReopenStep(milestone, step) {
    if (!canManage || !step || !step.is_completed || isBusy('step-toggle', step.id)) return
    setBusy('step-toggle', [step.id], true)
    try {
      const updated = await reopenProjectMilestoneStep(projectId, milestone.id, step.id)
      replaceMilestone(updated)
      const current = getFirstIncompleteStep(getMilestoneSteps(updated))
      if (current?.id === step.id) {
        showSuccess('Step reopened and set as the current step.')
      } else if (current) {
        showSuccess(`Step reopened. "${current.title}" is now the current step.`)
      } else {
        showSuccess('Step reopened. Progress updated.')
      }
    } catch (err) {
      setError(err?.message || 'Could not reopen the step.')
    } finally {
      setBusy('step-toggle', [step.id], false)
    }
  }

  async function handleMoveMilestone(index, delta) {
    const target = index + delta
    if (target < 0 || target >= items.length || isBusy('milestone-reorder', projectId)) return
    const reordered = [...items]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(target, 0, moved)
    const payload = { items: reordered.map((m, i) => ({ id: m.id, position: i })) }
    setBusy('milestone-reorder', [projectId], true)
    try {
      const updatedList = await reorderProjectMilestones(projectId, payload)
      if (Array.isArray(updatedList)) {
        setItems(updatedList)
        setSelectedId((sid) => (sid && updatedList.some((m) => m.id === sid) ? sid : (updatedList[0]?.id ?? null)))
      } else {
        await load()
      }
      showSuccess('Milestone roadmap order updated.')
    } catch (err) {
      setError(err?.message || 'Could not reorder milestones.')
    } finally {
      setBusy('milestone-reorder', [projectId], false)
    }
  }

  async function handleMoveStep(milestone, index, delta) {
    const steps = getMilestoneSteps(milestone)
    const target = index + delta
    if (target < 0 || target >= steps.length || isBusy('step-reorder', milestone.id)) return
    const reordered = [...steps]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(target, 0, moved)
    const payload = { items: reordered.map((s, i) => ({ id: s.id, position: i })) }
    setBusy('step-reorder', [milestone.id], true)
    try {
      const updated = await reorderProjectMilestoneSteps(projectId, milestone.id, payload)
      replaceMilestone(updated)
      const current = getFirstIncompleteStep(getMilestoneSteps(updated))
      showSuccess(current ? 'Step order updated. Current step recalculated from the new order.' : 'Step order updated.')
    } catch (err) {
      setError(err?.message || 'Could not reorder steps.')
    } finally {
      setBusy('step-reorder', [milestone.id], false)
    }
  }

  const pageBusy = milestoneDialog.busy || stepDialog.busy || confirmState.busy
  const selectedSteps = getMilestoneSteps(selectedMilestone)
  const selectedCurrentStep = getFirstIncompleteStep(selectedSteps)
  const selectedState = getMilestoneUiState(selectedMilestone)

  const renderRoadmap = () => (
    <section className="pm-surface p-4 sm:p-5" aria-label="Project milestones roadmap">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-[#F2F0EB]">Roadmap</h3>
          <p className="mt-0.5 text-[12.5px] text-[rgba(242,240,235,0.58)]">Milestones in progression order</p>
        </div>
        <span className="rounded-full border border-[rgba(242,240,235,0.12)] bg-[rgba(242,240,235,0.04)] px-2.5 py-1 text-[12px] font-medium text-[rgba(242,240,235,0.72)]">
          {items.length} total
        </span>
      </div>

      <div className="pm-roadmap">
        {items.map((milestone, index) => {
          const state = getMilestoneUiState(milestone)
          const selected = milestone.id === selectedId
          const progress = Number(milestone.progress || 0)
          const total = milestone.total_steps || 0
          const completed = milestone.completed_steps || 0
          const due = formatProjectDate(milestone.due_date)
          const isReordering = isBusy('milestone-reorder', projectId)
          const currentStep = getFirstIncompleteStep(getMilestoneSteps(milestone))

          return (
            <article key={milestone.id} className={cn('pm-roadmap-item', `is-${state}`)}>
              <RoadmapNode state={state} index={index} />
              <div
                className={cn('pm-milestone-card', selected && 'is-selected')}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedId(milestone.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setSelectedId(milestone.id)
                  }
                }}
                aria-pressed={selected}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="truncate text-[15px] font-semibold tracking-[-0.01em] text-[#F2F0EB]">{milestone.title}</h4>
                      <span className={cn('pm-pill', `is-${state}`)}>{milestoneStatusLabel(milestone)}</span>
                    </div>
                    {milestone.description ? (
                      <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-[rgba(242,240,235,0.62)]">{milestone.description}</p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-[rgba(242,240,235,0.62)]">
                      <span className="inline-flex items-center gap-1.5"><CalendarDays size={13} className="text-[rgba(242,240,235,0.45)]" /> {due || 'No target date'}</span>
                      <span className="inline-flex items-center gap-1.5"><ListChecks size={13} className="text-[rgba(242,240,235,0.45)]" /> {completed}/{total} steps</span>
                      <span className="font-medium text-[#F2F0EB]">{progress}%</span>
                    </div>
                    {state !== 'completed' && currentStep ? (
                      <p className="mt-2 text-[12.5px] text-[rgba(242,240,235,0.72)]">
                        <span className="font-medium text-[#FFC400]">Current step:</span> {currentStep.title}
                      </p>
                    ) : null}
                    {state === 'completed' ? (
                      <p className="mt-2 text-[12.5px] font-medium text-[#7BE0B3]">All steps completed</p>
                    ) : null}
                    <div className="mt-3">
                      <ProgressTrack progress={progress} complete={state === 'completed'} />
                    </div>
                  </div>

                  {canManage && (
                    <div className="flex shrink-0 items-center gap-1 self-start" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <Button type="button" variant="ghost" size="icon" className="size-8 pm-btn-ghost-dark" onClick={() => handleMoveMilestone(index, -1)} disabled={index === 0 || isReordering || pageBusy} aria-label="Move milestone up">
                        <ArrowUp size={14} />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="size-8 pm-btn-ghost-dark" onClick={() => handleMoveMilestone(index, 1)} disabled={index === items.length - 1 || isReordering || pageBusy} aria-label="Move milestone down">
                        <ArrowDown size={14} />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="ghost" size="icon" className="size-8 pm-btn-ghost-dark" aria-label={`Actions for ${milestone.title}`} disabled={pageBusy || isReordering}>
                            <MoreHorizontal size={15} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onSelect={() => setMilestoneDialog({ open: true, mode: 'edit', milestone, busy: false, error: '' })}>
                            <Pencil size={14} /> Edit milestone
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => { setSelectedId(milestone.id); setStepDialog({ open: true, mode: 'create', milestoneId: milestone.id, step: null, busy: false, error: '' }) }}>
                            <Plus size={14} /> Add step
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfirmState({ open: true, type: 'milestone', milestone, step: null, busy: false, error: '' })}>
                            <Trash2 size={14} /> Delete milestone
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </div>
                {!selected && (
                  <div className="mt-3 flex items-center justify-between text-[12.5px] text-[rgba(242,240,235,0.45)]">
                    <span>Open milestone to view full step progression</span>
                    <ChevronRight size={14} />
                  </div>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )

  const renderDetail = () => {
    if (!selectedMilestone) {
      return (
        <div className="pm-surface p-6 sm:p-8">
          <div className="pm-empty text-center">
            <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl bg-[#FFC400] text-[#0D0D0D]">
              <Flag size={18} />
            </div>
            <h3 className="text-[15px] font-semibold text-[#F2F0EB]">Select a milestone</h3>
            <p className="mt-1 text-[13px] text-[rgba(242,240,235,0.62)]">Choose a milestone from the roadmap to see its destination, current step, and complete journey.</p>
          </div>
        </div>
      )
    }

    const steps = selectedSteps
    const progress = Number(selectedMilestone.progress || 0)
    const completed = selectedMilestone.completed_steps || 0
    const total = selectedMilestone.total_steps || 0
    const isCompleted = selectedState === 'completed'

    return (
      <section className="pm-surface p-4 sm:p-6" aria-label="Milestone detail and step progression">
        <div className="mb-4 flex items-center justify-between gap-3 lg:hidden">
          <Button type="button" variant="ghost" className="h-8 px-2 text-[rgba(242,240,235,0.72)] hover:bg-[rgba(242,240,235,0.08)] hover:text-[#F2F0EB]" onClick={() => setSelectedId(null)}>
            <ArrowLeft size={15} /> Roadmap
          </Button>
          <span className={cn('pm-pill', `is-${selectedState}`)}>{milestoneStatusLabel(selectedMilestone)}</span>
        </div>

        {successMessage ? (
          <div className="pm-success-banner mb-4 flex items-start justify-between gap-3" role="status" aria-live="polite">
            <p>{successMessage}</p>
            <button type="button" className="shrink-0 text-[rgba(207,246,228,0.75)] hover:text-[#CFF6E4]" onClick={() => setSuccessMessage('')} aria-label="Dismiss message">×</button>
          </div>
        ) : null}

        <header className="border-b border-[rgba(242,240,235,0.1)] pb-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn('pm-pill hidden lg:inline-flex', `is-${selectedState}`)}>{milestoneStatusLabel(selectedMilestone)}</span>
                <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#F2F0EB] sm:text-2xl">{selectedMilestone.title}</h2>
              </div>
              <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-[rgba(242,240,235,0.68)]">
                {selectedMilestone.description || 'No description provided for this milestone destination.'}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-[rgba(242,240,235,0.62)]">
                <span className="inline-flex items-center gap-1.5"><Target size={14} className="text-[#FFC400]" /> {formatProjectDate(selectedMilestone.due_date) ? `Target ${formatProjectDate(selectedMilestone.due_date)}` : 'No target date'}</span>
                <span className="inline-flex items-center gap-1.5"><ListChecks size={14} className="text-[#FFC400]" /> {completed} of {total} steps completed</span>
              </div>
            </div>

            {canManage && (
              <div className="flex shrink-0 items-center gap-2">
                <Button type="button" variant="outline" className="h-9 border-[rgba(242,240,235,0.16)] bg-[rgba(242,240,235,0.03)] text-[#F2F0EB] hover:bg-[rgba(242,240,235,0.08)] hover:text-[#F2F0EB]" onClick={() => setMilestoneDialog({ open: true, mode: 'edit', milestone: selectedMilestone, busy: false, error: '' })} disabled={pageBusy}>
                  <Pencil size={14} /> Edit milestone
                </Button>
              </div>
            )}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[rgba(242,240,235,0.45)]">Overall progress</p>
                <p className="text-[13px] font-semibold text-[#F2F0EB]">{progress}% · {completed}/{total}</p>
              </div>
              <ProgressTrack progress={progress} complete={isCompleted} large />
            </div>
            <div className="pm-elevated px-4 py-3 sm:min-w-[180px]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[rgba(242,240,235,0.45)]">Milestone status</p>
              <p className="mt-1 text-[15px] font-semibold text-[#F2F0EB]">{isCompleted ? 'Completed' : selectedCurrentStep ? 'In progress' : total === 0 ? 'Not started' : 'Active'}</p>
              <p className="mt-0.5 text-[12.5px] text-[rgba(242,240,235,0.58)]">
                {isCompleted ? 'All journey steps are complete' : selectedCurrentStep ? 'Complete the current step to advance' : total === 0 ? 'Add steps to begin the journey' : 'Progress tracked by steps'}
              </p>
            </div>
          </div>
        </header>

        <div className="mt-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-[16px] font-semibold tracking-[-0.01em] text-[#F2F0EB]">Step progression</h3>
              <p className="mt-0.5 text-[13px] text-[rgba(242,240,235,0.58)]">Every step in order. The first incomplete step is the current step.</p>
            </div>
            {canManage && (
              <Button type="button" className="h-9 bg-[#FFC400] text-[#0D0D0D] hover:bg-[#FFD766]" onClick={() => setStepDialog({ open: true, mode: 'create', milestoneId: selectedMilestone.id, step: null, busy: false, error: '' })} disabled={pageBusy}>
                <Plus size={14} /> Add step
              </Button>
            )}
          </div>

          {steps.length === 0 ? (
            <div className="pm-empty">
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border border-[rgba(242,240,235,0.14)] bg-[rgba(242,240,235,0.04)] text-[#FFC400]">
                    <ListChecks size={18} />
                  </span>
                  <div>
                    <h4 className="text-[15px] font-semibold text-[#F2F0EB]">No steps yet</h4>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-[rgba(242,240,235,0.62)]">
                      This milestone does not have any steps yet. Add the journey steps that lead to this destination to start tracking progress from 0%.
                    </p>
                  </div>
                </div>
                {canManage ? (
                  <Button type="button" className="h-9 shrink-0 bg-[#FFC400] text-[#0D0D0D] hover:bg-[#FFD766]" onClick={() => setStepDialog({ open: true, mode: 'create', milestoneId: selectedMilestone.id, step: null, busy: false, error: '' })} disabled={pageBusy}>
                    <Plus size={14} /> Add first step
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <>
              <div className="pm-stepper" aria-label="Milestone stepper">
                {steps.map((step, index) => {
                  const state = getStepState(step, steps)
                  const isCurrent = state === 'current'
                  const isStepCompleted = state === 'completed'
                  const toggleBusy = isBusy('step-toggle', step.id)
                  const reorderBusy = isBusy('step-reorder', selectedMilestone.id)

                  return (
                    <div key={step.id} className={cn('pm-step', `is-${state}`)}>
                      <StepIndicator state={state} number={index + 1} />

                      <div className="pm-step-body">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {isCurrent ? <span className="pm-current-label">Current step</span> : null}
                              <h4 className={cn(
                                'text-[15px] tracking-[-0.01em]',
                                isCurrent ? 'font-semibold text-[#F2F0EB]' : isStepCompleted ? 'font-medium text-[rgba(242,240,235,0.86)]' : 'font-medium text-[rgba(242,240,235,0.55)]',
                              )}>
                                {step.title}
                              </h4>
                              <span className={cn(
                                'text-[12px] font-medium',
                                isStepCompleted ? 'text-[#7BE0B3]' : isCurrent ? 'text-[#FFC400]' : 'text-[rgba(242,240,235,0.42)]',
                              )}>
                                {isStepCompleted ? 'Completed' : isCurrent ? 'In progress' : 'Upcoming'}
                              </span>
                            </div>
                            {step.description ? (
                              <p className={cn('mt-1.5 text-[13.5px] leading-relaxed', isCurrent ? 'text-[rgba(242,240,235,0.72)]' : 'text-[rgba(242,240,235,0.56)]')}>
                                {step.description}
                              </p>
                            ) : null}
                            {step.completed_at ? (
                              <p className="mt-1.5 text-[12px] text-[rgba(242,240,235,0.45)]">
                                Completed {formatProjectDate(String(step.completed_at).slice(0, 10)) || ''}
                              </p>
                            ) : null}

                            {isCurrent && canManage ? (
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <Button
                                  type="button"
                                  className="h-9 bg-[#FFC400] text-[#0D0D0D] hover:bg-[#FFD766]"
                                  onClick={() => handleCompleteStep(selectedMilestone, step)}
                                  disabled={toggleBusy || pageBusy}
                                >
                                  <CheckCircle2 size={15} />
                                  {toggleBusy ? 'Completing…' : 'Mark current step complete'}
                                </Button>
                                <span className="text-[12.5px] text-[rgba(242,240,235,0.5)]">Completing advances progress to the next incomplete step.</span>
                              </div>
                            ) : null}

                            {isStepCompleted && canManage ? (
                              <div className="mt-2.5">
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-8 border-[rgba(242,240,235,0.16)] bg-transparent text-[rgba(242,240,235,0.8)] hover:bg-[rgba(242,240,235,0.08)] hover:text-[#F2F0EB]"
                                  onClick={() => handleReopenStep(selectedMilestone, step)}
                                  disabled={toggleBusy || pageBusy}
                                >
                                  <RotateCcw size={14} />
                                  {toggleBusy ? 'Reopening…' : 'Reopen step'}
                                </Button>
                              </div>
                            ) : null}
                          </div>

                          {canManage ? (
                            <div className="flex flex-wrap items-center gap-1 self-start sm:justify-end">
                              <Button type="button" variant="ghost" size="icon" className="size-8 pm-btn-ghost-dark" onClick={() => handleMoveStep(selectedMilestone, index, -1)} disabled={index === 0 || reorderBusy || pageBusy} aria-label={`Move step ${index + 1} up`}>
                                <ArrowUp size={14} />
                              </Button>
                              <Button type="button" variant="ghost" size="icon" className="size-8 pm-btn-ghost-dark" onClick={() => handleMoveStep(selectedMilestone, index, 1)} disabled={index === steps.length - 1 || reorderBusy || pageBusy} aria-label={`Move step ${index + 1} down`}>
                                <ArrowDown size={14} />
                              </Button>
                              <Button type="button" variant="ghost" size="icon" className="size-8 pm-btn-ghost-dark" onClick={() => setStepDialog({ open: true, mode: 'edit', milestoneId: selectedMilestone.id, step, busy: false, error: '' })} disabled={pageBusy} aria-label={`Edit step ${index + 1}`}>
                                <Pencil size={14} />
                              </Button>
                              <Button type="button" variant="ghost" size="icon" className="size-8 text-[rgba(242,240,235,0.55)] hover:bg-[rgba(239,100,100,0.12)] hover:text-[#ffb0b0]" onClick={() => setConfirmState({ open: true, type: 'step', milestone: selectedMilestone, step, busy: false, error: '' })} disabled={pageBusy} aria-label={`Delete step ${index + 1}`}>
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {isCompleted ? (
                <div className="pm-complete-banner mt-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-[#39B980] text-[#0D0D0D]">
                        <Check size={16} strokeWidth={3} />
                      </span>
                      <div>
                        <p className="text-[15px] font-semibold text-[#EFFFF7]">Milestone completed</p>
                        <p className="mt-0.5 text-[13px] text-[rgba(223,248,236,0.78)]">100% progress. Every step in this journey is complete. You can reopen a step if plans change.</p>
                      </div>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-[rgba(57,185,128,0.35)] bg-[rgba(57,185,128,0.12)] px-3 py-1 text-[12px] font-semibold text-[#9FE8C4]">100% complete</span>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>
    )
  }

  return (
    <div className="pm-dark grid gap-5">
      <div className="pm-surface relative overflow-hidden p-5 sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_260px_at_10%_-20%,rgba(255,196,0,0.14),transparent_55%),radial-gradient(700px_240px_at_100%_0%,rgba(77,141,255,0.1),transparent_50%)]" aria-hidden="true" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[rgba(242,240,235,0.45)]">Project milestones</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[#F2F0EB]">Milestone roadmap</h2>
            <p className="mt-1.5 max-w-3xl text-[13.5px] leading-relaxed text-[rgba(242,240,235,0.62)]">
              Each milestone is a destination. Open a milestone to follow its complete step-by-step journey, complete the current step, and advance progress toward 100%.
            </p>
          </div>
          {canManage && (
            <Button type="button" className="h-9 shrink-0 bg-[#FFC400] text-[#0D0D0D] hover:bg-[#FFD766]" onClick={() => setMilestoneDialog({ open: true, mode: 'create', milestone: null, busy: false, error: '' })} disabled={loading || pageBusy}>
              <Plus size={14} /> New milestone
            </Button>
          )}
        </div>
      </div>

      {error && !loading ? <ErrorState message={error} onRetry={load} /> : null}

      {loading ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(340px,0.95fr)_minmax(0,1.25fr)]" aria-busy="true" aria-label="Loading milestones">
          <div className="pm-surface p-5">
            <Skeleton className="h-5 w-32 bg-white/10" />
            <div className="mt-4 grid gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-[rgba(242,240,235,0.1)] bg-[rgba(242,240,235,0.03)] p-4">
                  <Skeleton className="h-4 w-40 max-w-full bg-white/10" />
                  <Skeleton className="mt-3 h-3 w-full bg-white/10" />
                  <Skeleton className="mt-4 h-2 w-full rounded-full bg-white/10" />
                </div>
              ))}
            </div>
          </div>
          <div className="pm-surface p-5 sm:p-6">
            <Skeleton className="h-6 w-56 max-w-full bg-white/10" />
            <Skeleton className="mt-4 h-4 w-full bg-white/10" />
            <Skeleton className="mt-2 h-4 w-2/3 bg-white/10" />
            <Skeleton className="mt-6 h-10 w-full rounded-full bg-white/10" />
            <div className="mt-6 grid gap-4">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl bg-white/10" />)}
            </div>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="pm-surface p-8 sm:p-10">
          <div className="pm-empty mx-auto max-w-2xl text-center">
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-[#FFC400] text-[#0D0D0D]">
              <Flag size={20} />
            </div>
            <h3 className="text-lg font-semibold text-[#F2F0EB]">No milestones yet</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-[rgba(242,240,235,0.62)]">
              Milestones represent major project achievements — the destinations on your project roadmap. Create a milestone to define where the project is headed and map the steps to get there.
            </p>
            {canManage ? (
              <div className="mt-5 flex justify-center">
                <Button type="button" className="h-9 bg-[#FFC400] text-[#0D0D0D] hover:bg-[#FFD766]" onClick={() => setMilestoneDialog({ open: true, mode: 'create', milestone: null, busy: false, error: '' })}>
                  <Plus size={14} /> Create milestone
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(340px,0.95fr)_minmax(0,1.25fr)] xl:items-start">
          <div className={cn('min-w-0', selectedId ? 'hidden lg:block' : 'block')}>
            {renderRoadmap()}
          </div>
          <div className={cn('min-w-0', selectedId ? 'block' : 'hidden lg:block')}>
            {renderDetail()}
          </div>
        </div>
      )}

      <MilestoneFormDialog
        open={milestoneDialog.open}
        mode={milestoneDialog.mode}
        initialMilestone={milestoneDialog.milestone}
        busy={milestoneDialog.busy}
        error={milestoneDialog.error}
        onClose={() => !milestoneDialog.busy && setMilestoneDialog({ open: false, mode: 'create', milestone: null, busy: false, error: '' })}
        onSubmit={handleMilestoneSubmit}
      />

      <StepFormDialog
        open={stepDialog.open}
        mode={stepDialog.mode}
        initialStep={stepDialog.step}
        busy={stepDialog.busy}
        error={stepDialog.error}
        onClose={() => !stepDialog.busy && setStepDialog({ open: false, mode: 'create', milestoneId: null, step: null, busy: false, error: '' })}
        onSubmit={handleStepSubmit}
      />

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.type === 'step' ? 'Delete step' : 'Delete milestone'}
        description={confirmState.type === 'step'
          ? `Delete "${confirmState.step?.title || 'this step'}"? Progress and the current step will be recalculated from the remaining steps.`
          : `Delete "${confirmState.milestone?.title || 'this milestone'}"? This will remove the milestone and all of its steps from the roadmap.`}
        confirmLabel="Delete"
        busyLabel="Deleting…"
        busy={confirmState.busy}
        error={confirmState.error}
        destructive
        onConfirm={handleConfirmDelete}
        onClose={() => !confirmState.busy && setConfirmState({ open: false, type: null, milestone: null, step: null, busy: false, error: '' })}
      />
    </div>
  )
}
