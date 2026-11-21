import { useState } from 'react'
import { CornerDownRight, ExternalLink, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FieldMessage } from '@/components/shared/FormField'
import { formatDate, statusLabel } from './utils/taskFormat.js'

export default function TaskSubtasksSection({
  task,
  subtasks,
  total,
  error,
  busy,
  onCreate,
  onOpenTask,
  canCreate = false,
}) {
  const [title, setTitle] = useState('')
  const [openForm, setOpenForm] = useState(false)

  const doneCount = subtasks.filter((s) => s.status === 'done').length
  const progress = subtasks.length ? Math.round((doneCount / subtasks.length) * 100) : 0

  async function handleCreate(e) {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    const ok = await onCreate({ title: trimmed, priority: task?.priority || 'medium' })
    if (ok) {
      setTitle('')
      setOpenForm(false)
    }
  }

  return (
    <section className="grid gap-3" aria-labelledby="task-subtasks-title">
      <div className="flex items-center justify-between gap-2">
        <h3 id="task-subtasks-title" className="text-[13px] font-semibold">Subtasks</h3>
        <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-medium">{total ?? subtasks.length}</Badge>
      </div>

      {subtasks.length > 0 && (
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between text-[12px] text-muted-foreground">
            <span>Completion progress</span>
            <span>{doneCount}/{subtasks.length} done ({progress}%)</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
            <div className="h-full rounded-full bg-foreground/70" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {subtasks.length === 0 ? (
        <p className="text-[12.5px] text-muted-foreground">No subtasks.</p>
      ) : (
        <ul className="grid gap-2">
          {subtasks.map((subtask) => (
            <li key={subtask.id} className="flex items-start gap-2 rounded-[var(--radius-md)] border border-border bg-card px-3 py-2">
              <CornerDownRight size={14} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="truncate text-left text-[13px] font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm" onClick={() => onOpenTask?.(subtask.id)}>
                    {subtask.title}
                  </button>
                  <Badge variant="outline" className="px-1.5 py-0 text-[10px]">{statusLabel(subtask.status)}</Badge>
                </div>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                  {subtask.due_date ? `Due ${formatDate(subtask.due_date)}` : 'No due date'}
                </p>
              </div>
              <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" aria-label={`Open subtask ${subtask.title}`} onClick={() => onOpenTask?.(subtask.id)}>
                <ExternalLink size={14} aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <FieldMessage error={error} />

      {canCreate ? (
        openForm ? (
          <form className="grid gap-2 rounded-[var(--radius-md)] border border-border bg-background p-3" onSubmit={handleCreate}>
            <label htmlFor="subtask-title" className="text-[12.5px] font-medium">New subtask title</label>
            <Input id="subtask-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Subtask title" className="h-9" disabled={busy} />
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" className="h-8" disabled={busy || !title.trim()}>{busy ? 'Creating…' : 'Create subtask'}</Button>
              <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => { setOpenForm(false); setTitle('') }} disabled={busy}>Cancel</Button>
            </div>
          </form>
        ) : (
          <div>
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setOpenForm(true)}>
              <Plus size={14} aria-hidden="true" /> Add subtask
            </Button>
          </div>
        )
      ) : (
        <p className="text-[12px] text-muted-foreground">Subtask creation is available to the task owner (subject to backend permissions).</p>
      )}
    </section>
  )
}
