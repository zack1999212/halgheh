import { Check } from 'lucide-react'
import DialogShell from '@/components/shared/DialogShell'
import { Badge } from '@/components/ui/badge'
import { useWorkspaceTheme } from '../workspace/hooks/useWorkspaceTheme.js'

/** Read-only popup opened from a road node: description + attached tasks. */
export default function MilestoneStepDialog({ open, step, index, onClose }) {
  const { theme } = useWorkspaceTheme()

  if (!step) {
    return null
  }

  const tasks = step.tasks || []
  const done = step.completed_tasks ?? tasks.filter((task) => task.status === 'done').length

  return (
    <DialogShell
      open={open}
      title={`${String(index + 1).padStart(2, '0')} · ${step.title}`}
      description="Step details"
      onClose={onClose}
      theme={theme}
      contentClassName="ws-dialog-scope"
    >
      <div className="milestone-step-dialog">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-[11px]">
            {step.is_completed ? 'Completed' : 'In progress'}
          </Badge>
          <span className="text-[12px] text-muted-foreground">
            {done} of {step.total_tasks} tasks done
          </span>
        </div>

        {step.description && (
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
            {step.description}
          </p>
        )}

        <div className="milestone-task-list">
          {tasks.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground">
              No tasks attached to this step.
            </p>
          ) : (
            tasks.map((task) => {
              const completed = task.status === 'done'
              return (
                <div
                  key={task.id}
                  className={`milestone-task-row${completed ? ' is-done' : ''}`}
                >
                  <span
                    className="milestone-task-tick"
                    aria-label={completed ? 'Done' : 'Not done'}
                  >
                    {completed && <Check size={12} strokeWidth={3} aria-hidden="true" />}
                  </span>
                  <span className="milestone-task-title">{task.title}</span>
                </div>
              )
            })
          )}
        </div>
      </div>
    </DialogShell>
  )
}
