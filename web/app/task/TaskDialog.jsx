import { useEffect, useMemo, useState } from 'react'
import DialogShell from '@/components/shared/DialogShell'
import FormError from '@/components/shared/FormError'
import FormField, { fieldInputClass } from '@/components/shared/FormField'
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
import { attachLabel, createTask, detachLabel, setTaskParent, updateTask, updateTaskStatus } from './api.js'
import { TASK_PRIORITIES, TASK_STATUSES } from './utils/taskConstants.js'

const NO_PARENT = '__none__'

export default function TaskDialog({
  open,
  mode = 'create',
  task = null,
  allTasks = [],
  availableLabels = [],
  projectId = null,
  workspaceId = null,
  onClose,
  onSaved,
}) {
  const isEdit = mode === 'edit' && Boolean(task)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [statusValue, setStatusValue] = useState('todo')
  const [startDate, setStartDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [parentId, setParentId] = useState(NO_PARENT)
  const [selectedLabelIds, setSelectedLabelIds] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    setSaving(false)
    if (isEdit && task) {
      setTitle(task.title || '')
      setDescription(task.description || '')
      setPriority(task.priority || 'medium')
      setStatusValue(task.status || 'todo')
      setStartDate(task.start_date || '')
      setDueDate(task.due_date || '')
      setParentId(task.parent_task_id ? String(task.parent_task_id) : NO_PARENT)
      setSelectedLabelIds(Array.isArray(task.labels) ? task.labels.map((l) => l.id) : [])
    } else {
      setTitle('')
      setDescription('')
      setPriority('medium')
      setStatusValue('todo')
      setStartDate('')
      setDueDate('')
      setParentId(NO_PARENT)
      setSelectedLabelIds([])
    }
  }, [open, isEdit, task])

  const parentOptions = useMemo(() => {
    const selfId = task?.id
    return (allTasks || []).filter((t) => {
      if (t.id === selfId) return false
      if (projectId != null) return String(t.project_id) === String(projectId)
      return true
    })
  }, [allTasks, task?.id, projectId])

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
    try {
      if (!isEdit) {
        const payload = {
          title: trimmed,
          priority,
          description: description.trim() ? description.trim() : null,
          start_date: startDate || null,
          due_date: dueDate || null,
        }
        if (projectId != null) payload.project_id = Number(projectId)
        if (workspaceId != null) payload.workspace_id = Number(workspaceId)
        // Status, assignees, labels, and parent-on-create are not part of TaskCreate schema.
        // Subtask creation/label attachment/assignment are separate supported endpoints and are surfaced in task details.
        await createTask(payload)
      } else {
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

        const nextParent = parentId === NO_PARENT ? null : Number(parentId)
        const prevParent = task.parent_task_id ?? null
        if (nextParent !== prevParent) {
          await setTaskParent(task.id, nextParent)
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
      }

      onSaved?.()
      onClose()
    } catch (err) {
      setError(err?.message || 'Could not save the task.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <DialogShell
      open={open}
      wide
      title={isEdit ? 'Edit task' : 'New task'}
      description={isEdit ? 'Update task details using supported task operations.' : 'Create a task. Advanced assignment/label attachment can be managed from task details where supported.'}
      onClose={saving ? () => {} : onClose}
      contentClassName="tasks-dialog"
      footer={
        <>
          <Button type="button" variant="outline" className="h-9" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" form="task-dialog-form" className="h-9" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create task'}
          </Button>
        </>
      }
    >
      <form id="task-dialog-form" className="grid gap-4" onSubmit={handleSubmit}>
        <FormError>{error}</FormError>

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
          <Label htmlFor="task-parent" className="text-[13px] font-medium">Parent task</Label>
          <Select value={parentId} onValueChange={setParentId} disabled={saving || !isEdit}>
            <SelectTrigger id="task-parent"><SelectValue placeholder="No parent" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PARENT}>No parent</SelectItem>
              {parentOptions.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>#{t.id} — {t.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!isEdit && <p className="text-[12px] text-muted-foreground">Parent assignment on creation is handled via subtask creation flows (supported separately). Use task details/subtask actions for hierarchy creation.</p>}
          {isEdit && <p className="text-[12px] text-muted-foreground">Parent changes use the supported hierarchy endpoint (owner-only; backend validates cycles).</p>}
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
    </DialogShell>
  )
}
