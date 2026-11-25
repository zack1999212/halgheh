import { Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import TasksViewSelector from './TasksViewSelector.jsx'

export default function TasksToolbar({
  view,
  onViewChange,
  onCreate,
  activeLabel,
  total,
  title = 'Tasks',
  canCreate = true,
}) {
  return (
    <div className="tasks-toolbar flex flex-col gap-2">
      <div className="flex flex-wrap items-start justify-between gap-3 sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="tasks-toolbar-title">
              {title}
            </h2>
            <div className="flex min-w-0 flex-wrap items-center gap-2" aria-live="polite">
              <span className="tasks-toolbar-subtitle truncate text-[13px] font-medium">
                {activeLabel}
              </span>
              {typeof total === 'number' && (
                <Badge
                  variant="secondary"
                  className="shrink-0 rounded-full border border-[rgba(35,30,24,.08)] bg-white/70 px-2.5 py-0.5 text-[11px] font-medium tabular-nums text-[#6E6A60]"
                >
                  {total} {total === 1 ? 'task' : 'tasks'}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="ml-auto flex w-full flex-wrap items-center justify-start gap-2 sm:w-auto sm:justify-end">
          <TasksViewSelector view={view} onChange={onViewChange} />
          {canCreate ? (
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5 shadow-sm"
              onClick={onCreate}
            >
              <Plus size={15} aria-hidden="true" />
              Create Task
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
