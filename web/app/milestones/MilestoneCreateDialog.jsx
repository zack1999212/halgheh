import { useEffect, useState } from 'react'
import { Check, Plus, Trash2 } from 'lucide-react'
import DialogShell from '@/components/shared/DialogShell'
import FormError from '@/components/shared/FormError'
import FormField from '@/components/shared/FormField'
import { useToast } from '@/components/shared/ToastProvider'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { listTasks } from '../features/tasks/api/client.js'
import { useWorkspaceTheme } from '../workspace/hooks/useWorkspaceTheme.js'
import { createMilestone } from './api.js'

let stepKey = 0
const newStep = () => ({
  key: ++stepKey,
  title: '',
  description: '',
  taskIds: [],
  showTasks: false,
})

/** Owner-only: create a roadmap with named steps and their attached tasks. */
export default function MilestoneCreateDialog({
  open,
  workspaceId,
  onClose,
  onCreated,
}) {
  const { theme } = useWorkspaceTheme()
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [steps, setSteps] = useState([newStep()])
  const [tasks, setTasks] = useState([])
  const [tasksLoading, setTasksLoading] = useState(false)
  const [tasksError, setTasksError] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setTitle('')
    setDescription('')
    setDueDate('')
    setSteps([newStep()])
    setError('')
    setTasksLoading(true)
    setTasksError('')
    listTasks({ workspace_id: workspaceId, limit: 100 })
      .then((data) => {
        setTasks(Array.isArray(data?.items) ? data.items : [])
      })
      .catch((err) => {
        setTasksError(err?.message || 'Could not load tasks.')
      })
      .finally(() => setTasksLoading(false))
  }, [open, workspaceId])

  function updateStep(key, updates) {
    setSteps((current) =>
      current.map((step) => (step.key === key ? { ...step, ...updates } : step)),
    )
  }

  function toggleTask(step, taskId, checked) {
    updateStep(step.key, {
      taskIds: checked
        ? [...step.taskIds, taskId]
        : step.taskIds.filter((id) => id !== taskId),
    })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy || !workspaceId) return
    if (!title.trim()) {
      setError('Enter a name for the milestone.')
      return
    }
    if (steps.some((step) => !step.title.trim())) {
      setError('Every step needs a name.')
      return
    }
    if (steps.some((step) => step.taskIds.length === 0)) {
      setError('Attach at least one task to every step.')
      return
    }

    setBusy(true)
    setError('')
    try {
      const created = await createMilestone(workspaceId, {
        title: title.trim(),
        description: description.trim() || null,
        due_date: dueDate || null,
        steps: steps.map((step) => ({
          title: step.title.trim(),
          description: step.description.trim() || null,
          task_ids: step.taskIds,
        })),
      })
      toast.success('Milestone created')
      onCreated?.(created)
      onClose()
    } catch (err) {
      setError(err?.message || 'Could not create the milestone.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogShell
      open={open}
      title="Create milestone"
      description="Build the road: name each step and attach the tasks that complete it."
      onClose={() => !busy && onClose()}
      theme={theme}
      wide
      contentClassName="ws-dialog-scope"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="create-milestone-form" disabled={busy}>
            {busy ? 'Creating…' : 'Create milestone'}
          </Button>
        </>
      }
    >
      <form id="create-milestone-form" className="grid gap-4" onSubmit={handleSubmit}>
        <FormError>{error}</FormError>

        <FormField id="milestone-title" label="Name">
          {(props) => (
            <Input
              {...props}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Launch"
              maxLength={200}
              autoFocus
            />
          )}
        </FormField>

        <FormField id="milestone-description" label="Description" optional>
          {(props) => (
            <Textarea
              {...props}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What does this milestone achieve?"
              rows={2}
              maxLength={5000}
            />
          )}
        </FormField>

        <FormField id="milestone-due-date" label="Due date" optional>
          {(props) => (
            <Input
              {...props}
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          )}
        </FormField>

        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-medium">Steps</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSteps((current) => [...current, newStep()])}
            >
              <Plus size={14} aria-hidden="true" />
              Add step
            </Button>
          </div>

          {steps.map((step, index) => (
            <div key={step.key} className="milestone-step-editor">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-semibold text-muted-foreground">
                  Step {index + 1}
                </span>
                {steps.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() =>
                      setSteps((current) => current.filter((item) => item.key !== step.key))
                    }
                    aria-label={`Remove step ${index + 1}`}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </Button>
                )}
              </div>

              <Input
                value={step.title}
                onChange={(event) => updateStep(step.key, { title: event.target.value })}
                placeholder="Step name"
                maxLength={200}
                aria-label={`Step ${index + 1} name`}
              />
              <Textarea
                value={step.description}
                onChange={(event) =>
                  updateStep(step.key, { description: event.target.value })
                }
                placeholder="Description (optional)"
                rows={2}
                maxLength={5000}
                aria-label={`Step ${index + 1} description`}
              />

              <button
                type="button"
                className="milestone-task-toggle"
                onClick={() => updateStep(step.key, { showTasks: !step.showTasks })}
                aria-expanded={step.showTasks}
              >
                <Check size={13} aria-hidden="true" />
                {step.taskIds.length
                  ? `${step.taskIds.length} task${step.taskIds.length === 1 ? '' : 's'} attached`
                  : 'Attach tasks'}
              </button>

              {step.showTasks && (
                <div className="milestone-task-picker">
                  {tasksLoading && (
                    <p className="text-[12px] text-muted-foreground">Loading tasks…</p>
                  )}
                  {!tasksLoading && tasksError && <FormError>{tasksError}</FormError>}
                  {!tasksLoading && !tasksError && tasks.length === 0 && (
                    <p className="text-[12px] text-muted-foreground">
                      No tasks in this workspace yet.
                    </p>
                  )}
                  {tasks.map((task) => (
                    <label key={task.id} className="milestone-task-option">
                      <Checkbox
                        checked={step.taskIds.includes(task.id)}
                        onCheckedChange={(checked) => toggleTask(step, task.id, checked === true)}
                      />
                      <span className="truncate">{task.title}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </form>
    </DialogShell>
  )
}
