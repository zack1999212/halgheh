import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import TasksViewSelector from './TasksViewSelector.jsx'

export default function TasksToolbar({ view, onViewChange, onCreate, activeLabel, total }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-1 text-[15px] font-semibold tracking-[-0.01em]">Tasks</h2>
        <p className="min-w-0 truncate text-[13px] text-muted-foreground" aria-live="polite">
          {activeLabel}{typeof total === 'number' ? ` · ${total} total` : ''}
        </p>
        <Button
          type="button"
          size="sm"
          className="ml-auto h-8 gap-1.5"
          onClick={onCreate}
        >
          <Plus size={15} aria-hidden="true" />
          Create Task
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="ml-auto flex items-center">
          <TasksViewSelector view={view} onChange={onViewChange} />
        </div>
      </div>
    </div>
  )
}
