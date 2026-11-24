import { useEffect, useMemo, useRef, useState } from 'react'
import DialogShell from '@/components/shared/DialogShell'
import ErrorState from '@/components/shared/ErrorState'
import FormError from '@/components/shared/FormError'
import FormField, { fieldInputClass } from '@/components/shared/FormField'
import LoadingState from '@/components/shared/LoadingState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { attachLabel, createChecklistItem, createTask, detachLabel, updateTask, updateTaskStatus } from './api.js'
import TaskChecklistSection from './TaskChecklistSection.jsx'
import { TASK_PRIORITIES, TASK_STATUSES } from './utils/taskConstants.js'
const DRAFT_KEY_CREATE = 'tasks:draft:create'

function draftKey(mode, taskId) {
  return mode === 'edit' && taskId ? `tasks:draft:edit:${taskId}` : DRAFT_KEY_CREATE
}

function readDraft(mode, taskId) {
  try {
    const raw = sessionStorage.getItem(draftKey(mode, taskId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

function writeDraft(mode, taskId, payload) {
  try {
    sessionStorage.setItem(draftKey(mode, taskId), JSON.stringify(payload))
  } catch {
    // Ignore storage quota/private mode failures.
  }
}

function clearDraft(mode, taskId) {
  try {
    sessionStorage.removeItem(draftKey(mode, taskId))
  } catch {
    // Ignore storage failures.
  }
}

export default function TaskDialog({
  open,
  mode = 'create',
  task = null,
  availableLabels = [],
  allTasks = [],
  projectId = null,
  workspaceId = null,
  onClose,
  onSaved,
  onChanged,
  loading = false,
  loadError = '',
}) {
  const isEdit = mode === 'edit' && Boolean(task)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [statusValue, setStatusValue] = useState('todo')
  const [startDate, setStartDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [selectedLabelIds, setSelectedLabelIds] = useState([])
  const [draftChecklist, setDraftChecklist] = useState([])
  const [createdTaskId, setCreatedTaskId] = useState(null)
  const [checklistSubmitError, setChecklistSubmitError] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [draftConflict, setDraftConflict] = useState('')
  const [draftRestored, setDraftRestored] = useState(false)
  const initKeyRef = useRef('')

  const parentOptions = useMemo(() => {
    const selfId = task?.id
    return (allTasks || []).filter((t) => {
      if (t.id === selfId) return false
      if (projectId != null) return String(t.project_id) === String(projectId)
      return true
    })
  }, [allTasks, task?.id, projectId])

  useEffect(() => {
    if (!open) {
      initKeyRef.current = ''
      return
    }
    const mode = isEdit ? 'edit' : 'create'
    const keyTaskId = isEdit ? task?.id : 'new'
    const initKey = `${mode}:${keyTaskId ?? 'none'}:${task?.updated_at ?? ''}:${loading ? 'loading' : 'ready'}`
    if (loading) return
    if (initKeyRef.current === initKey) return
    initKeyRef.current = initKey

    setError('')
    setChecklistSubmitError('')
    setCreatedTaskId(null)
    setSaving(false)
    setDraftConflict('')
    setDraftRestored(false)

    const base = isEdit && task ? {
      title: task.title || '',
      description: task.description || '',
      priority: task.priority || 'medium',
      statusValue: task.status || 'todo',
      startDate: task.start_date || '',
      dueDate: task.due_date || '',
      selectedLabelIds: Array.isArray(task.labels) ? task.labels.map((l) => l.id) : [],
      draftChecklist: [],
    } : {
      title: '',
      description: '',
      priority: 'medium',
      statusValue: 'todo',
      startDate: '',
      dueDate: '',
      selectedLabelIds: [],
      draftChecklist: [],
    }

    const draft = readDraft(mode, isEdit ? task?.id : null)
    let next = base
    if (draft && typeof draft === 'object') {
      if (isEdit) {
        const sameTask = Number(draft.taskId) === Number(task?.id)
        const sameVersion = !draft.taskUpdatedAt || !task?.updated_at || draft.taskUpdatedAt === task.updated_at
        if (sameTask && sameVersion && draft.fields && typeof draft.fields === 'object') {
          next = { ...base, ...draft.fields, selectedLabelIds: Array.isArray(draft.fields.selectedLabelIds) ? draft.fields.selectedLabelIds : base.selectedLabelIds }
          setDraftRestored(true)
        } else if (sameTask && !sameVersion) {
          setDraftConflict('A saved draft was found for this task, but the task changed on the server. Draft was not auto-restored.')
        }
      } else if (draft.fields && typeof draft.fields === 'object') {
        next = {
          ...base,
          ...draft.fields,
          selectedLabelIds: Array.isArray(draft.fields.selectedLabelIds) ? draft.fields.selectedLabelIds : base.selectedLabelIds,
          draftChecklist: Array.isArray(draft.fields.draftChecklist) ? draft.fields.draftChecklist : [],
        }
        if (draft.createdTaskId) setCreatedTaskId(draft.createdTaskId)
        setDraftRestored(true)
      }
    }

    setTitle(next.title || '')
    setDescription(next.description || '')
    setPriority(next.priority || 'medium')
    setStatusValue(next.statusValue || 'todo')
    setStartDate(next.startDate || '')
    setDueDate(next.dueDate || '')
    setSelectedLabelIds(Array.isArray(next.selectedLabelIds) ? next.selectedLabelIds : [])
    setDraftChecklist(Array.isArray(next.draftChecklist) ? next.draftChecklist : [])
  }, [open, isEdit, loading, task])

  useEffect(() => {
    if (!open || loading) return
    if (!initKeyRef.current) return
    const mode = isEdit ? 'edit' : 'create'
    const keyTaskId = isEdit ? task?.id : null
    if (isEdit && !keyTaskId) return
    const payload = {
      taskId: keyTaskId,
      taskUpdatedAt: isEdit ? (task?.updated_at ?? null) : null,
      createdTaskId: !isEdit ? createdTaskId : null,
      savedAt: Date.now(),
      fields: {
        title,
        description,
        priority,
        statusValue,
        startDate,
        dueDate,
        selectedLabelIds,
        draftChecklist: !isEdit ? draftChecklist : [],
      },
    }
    writeDraft(mode, keyTaskId, payload)
  }, [open, loading, isEdit, task?.id, task?.updated_at, createdTaskId, title, description, priority, statusValue, startDate, dueDate, selectedLabelIds, draftChecklist])
>>>>>>> 9c1e503 (fix and edit task)

  const attachedLabels = Array.isArray(task?.labels) ? task.labels : []
  const assignments = Array.isArray(task?.assignments) ? task.assignments : []

  function toggleLabel(id) {
    setSelectedLabelIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const trimmed = title.trim()
    if (!trimmed) {
      setError('Task title is required.')
      return
    }
    if (startDate && dueDate && dueDate < startDate) {
      setError('Due date must not be earlier than start date.')
      return
    }

    setSaving(true)
    setChecklistSubmitError('')
    try {
      let taskIdForChecklist = isEdit ? task?.id : createdTaskId
      if (!isEdit && !taskIdForChecklist) {
        const payload = {
          title: trimmed,
          priority,
          description: description.trim() ? description.trim() : null,
          start_date: startDate || null,
          due_date: dueDate || null,
        }
        if (projectId != null) payload.project_id = Number(projectId)
        if (workspaceId != null) payload.workspace_id = Number(workspaceId)
        const created = await createTask(payload)
        taskIdForChecklist = created?.id ?? null
        setCreatedTaskId(taskIdForChecklist)
        onChanged?.()
      }

      if (isEdit) {
        const patch = {}
        if (trimmed !== (task.title || '')) patch.title = trimmed
        const nextDesc = description.trim() ? description.trim() : null
        if ((task.description || null) !== nextDesc) patch.description = nextDesc
        if (priority !== task.priority) patch.priority = priority
        const nextStart = startDate || null
        const nextDue = dueDate || null
        if ((task.start_date || null) !== nextStart) patch.start_date = nextStart
        if ((task.due_date || null) !== nextDue) patch.due_date = nextDue
        if (Object.keys(patch).length > 0) {
          await updateTask(task.id, patch)
        }

        if (statusValue !== task.status) {
          await updateTaskStatus(task.id, statusValue)
        }

        // Apply label attachment diffs (owner-only; backend enforces permissions).
        const prevIds = new Set(attachedLabels.map((l) => l.id))
        const nextIds = new Set(selectedLabelIds)
        for (const id of nextIds) {
          if (!prevIds.has(id)) await attachLabel(task.id, id)
        }
        for (const id of prevIds) {
          if (!nextIds.has(id)) await detachLabel(task.id, id)
        }
      } else if (taskIdForChecklist) {
        // Submit draft checklist items after task exists. Do not duplicate items on retry.
        const pending = (Array.isArray(draftChecklist) ? draftChecklist : [])
          .filter((item) => item && !item.createdId)
          .filter((item) => typeof item.title === 'string' && item.title.trim())
        if (pending.length > 0) {
          const nextDraft = draftChecklist.map((item) => ({ ...item }))
          const failures = []
          for (const item of pending) {
            const idx = nextDraft.findIndex((d) => d.id === item.id)
            try {
              const createdItem = await createChecklistItem(taskIdForChecklist, { title: item.title.trim() })
              if (idx >= 0) nextDraft[idx] = { ...nextDraft[idx], createdId: createdItem?.id ?? true, title: item.title.trim() }
            } catch (err) {
              if (idx >= 0) nextDraft[idx] = { ...nextDraft[idx], submitError: err?.message || 'Could not create checklist item.' }
              failures.push(item.title.trim())
            }
          }
          setDraftChecklist(nextDraft)
          if (failures.length > 0) {
            setChecklistSubmitError(`Task was created, but ${failures.length} checklist item${failures.length === 1 ? '' : 's'} could not be saved. You can retry without creating another task.`)
            setError('Some checklist items were not saved. Review the checklist below and retry.')
            onChanged?.()
            return
          }
        }
      }

      clearDraft(isEdit ? 'edit' : 'create', isEdit ? task?.id : null)
      setCreatedTaskId(null)
      setDraftChecklist([])
      setChecklistSubmitError('')
      onSaved?.({ mode: isEdit ? 'edit' : 'create' })
      onClose()
    } catch (err) {
      setError(err?.message || 'Could not save the task.')
    } finally {
      setSaving(false)
    }
  }

  function handleRestoreConflictDraft() {
    const draft = readDraft('edit', task?.id)
    if (!draft?.fields || Number(draft.taskId) !== Number(task?.id)) return
    const f = draft.fields
    setTitle(f.title || '')
    setDescription(f.description || '')
    setPriority(f.priority || 'medium')
    setStatusValue(f.statusValue || 'todo')
    setStartDate(f.startDate || '')
    setDueDate(f.dueDate || '')
    setSelectedLabelIds(Array.isArray(f.selectedLabelIds) ? f.selectedLabelIds : [])
    setDraftConflict('')
    setDraftRestored(true)
  }

  function handleDiscardConflictDraft() {
    clearDraft('edit', task?.id)
    setDraftConflict('')
  }

  function handleDialogClose() {
    if (saving) return
    clearDraft(isEdit ? 'edit' : 'create', isEdit ? task?.id : null)
    onClose()
  }

  return (
    <DialogShell
      open={open}
      wide
      title={isEdit ? 'Edit task' : 'New task'}
      description={isEdit ? 'Update task details using supported task operations.' : 'Create a task. Advanced assignment/label attachment can be managed from task details where supported.'}
      onClose={handleDialogClose}
      contentClassName="tasks-dialog"
      footer={
        loading || loadError ? (
          <Button type="button" variant="outline" className="h-9" onClick={handleDialogClose}>Close</Button>
        ) : (
          <>
            <Button type="button" variant="outline" className="h-9" onClick={handleDialogClose} disabled={saving}>Cancel</Button>
            <Button type="submit" form="task-dialog-form" className="h-9" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : createdTaskId ? 'Retry checklist save' : 'Create task'}
            </Button>
          </>
        )
      }
    >
      {loading ? (
        <div className="py-6"><LoadingState label="Loading task…" /></div>
      ) : loadError ? (
        <ErrorState title="Could not load task" message={loadError} />
      ) : (
      <form id="task-dialog-form" className="grid gap-4" onSubmit={handleSubmit}>
        <FormError>{error}</FormError>
        {draftRestored && !draftConflict && (
          <p className="rounded-[var(--radius-md)] border border-border bg-muted/30 px-3 py-2 text-[12.5px] text-muted-foreground">
            Unsaved draft restored for this session.
          </p>
        )}
        {draftConflict && (
          <div className="grid gap-2 rounded-[var(--radius-md)] border border-destructive/30 bg-destructive/5 px-3 py-2">
            <p className="text-[12.5px] text-destructive" role="alert">{draftConflict}</p>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" className="h-8" onClick={handleRestoreConflictDraft}>Restore draft</Button>
              <Button type="button" size="sm" variant="ghost" className="h-8" onClick={handleDiscardConflictDraft}>Discard draft</Button>
            </div>
          </div>
        )}

        <FormField id="task-title" label="Title">
          {(field) => (
            <Input {...field} className={fieldInputClass} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" disabled={saving} autoFocus />
          )}
        </FormField>

        <div className="grid gap-2">
          <Label htmlFor="task-description" className="text-[13px] font-medium">Description <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Textarea id="task-description" className="min-h-[90px] rounded-[var(--radius-md)] px-3 py-2 text-base md:text-[15px]" value={description} onChange={(e) => setDescription(e.target.value)} disabled={saving} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="task-status" className="text-[13px] font-medium">Status</Label>
            <Select value={statusValue} onValueChange={setStatusValue} disabled={saving || !isEdit}>
              <SelectTrigger id="task-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TASK_STATUSES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {!isEdit && <p className="text-[12px] text-muted-foreground">New tasks start as To Do (backend default).</p>}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="task-priority" className="text-[13px] font-medium">Priority</Label>
            <Select value={priority} onValueChange={setPriority} disabled={saving}>
              <SelectTrigger id="task-priority"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TASK_PRIORITIES.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="task-start-date" className="text-[13px] font-medium">Start date</Label>
            <Input id="task-start-date" type="date" className={fieldInputClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={saving} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="task-due-date" className="text-[13px] font-medium">Due date</Label>
            <Input id="task-due-date" type="date" className={fieldInputClass} value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={saving} />
          </div>
        </div>

        <div className="grid gap-2">
          {checklistSubmitError ? (
            <p className="rounded-[var(--radius-md)] border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12.5px] text-destructive" role="alert">
              {checklistSubmitError}
            </p>
          ) : null}
          {createdTaskId && !isEdit ? (
            <p className="rounded-[var(--radius-md)] border border-border bg-muted/30 px-3 py-2 text-[12.5px] text-muted-foreground">
              Task was created. Retry to save the remaining checklist items.
            </p>
          ) : null}
          <TaskChecklistSection
            taskId={isEdit ? task?.id : null}
            canEdit
            draftMode={!isEdit}
            draftItems={!isEdit ? draftChecklist : []}
            onDraftItemsChange={!isEdit ? setDraftChecklist : undefined}
            onChanged={() => onChanged?.()}
          />
        </div>

        <div className="grid gap-2">
          <span className="text-[13px] font-medium">Assignees</span>
          {isEdit ? (
            assignments.length ? (
              <div className="flex flex-wrap gap-1.5">
                {assignments.map((a) => (
                  <Badge key={a.id} variant="secondary" className="font-medium">User #{a.assigned_user_id} ({a.assignment_status})</Badge>
                ))}
              </div>
            ) : (
              <p className="text-[12.5px] text-muted-foreground">No assignees.</p>
            )
          ) : (
            <p className="text-[12.5px] text-muted-foreground">Assignees can be managed from task details after creation where supported.</p>
          )}
          <p className="text-[12px] text-muted-foreground">
            Adding assignees requires selecting authorized users. No user-directory/lookup endpoint is available to the frontend, so assignee addition is not simulated here; removal of existing assignees is available in task details (owner-only, backend-enforced).
          </p>
        </div>

        <div className="grid gap-2">
          <span className="text-[13px] font-medium">Labels</span>
          {isEdit ? (
            availableLabels.length ? (
              <div className="flex flex-wrap gap-2">
                {availableLabels.map((label) => {
                  const active = selectedLabelIds.includes(label.id)
                  return (
                    <button
                      key={label.id}
                      type="button"
                      onClick={() => toggleLabel(label.id)}
                      disabled={saving}
                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? 'border-foreground/20 bg-foreground text-background' : 'border-border bg-card text-foreground hover:bg-accent/60'}`}
                      aria-pressed={active}
                    >
                      {label.name}
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="text-[12.5px] text-muted-foreground">No labels available for your account. Create/manage labels via supported label APIs before attaching (owner-only attach/detach).</p>
            )
          ) : (
            <p className="text-[12.5px] text-muted-foreground">Labels can be attached from task details after creation using supported label endpoints.</p>
          )}
        </div>
      </form>
      )}
    </DialogShell>
  )
}
