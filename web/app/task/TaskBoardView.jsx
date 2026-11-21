import LoadingState from '@/components/shared/LoadingState'
import ErrorState from '@/components/shared/ErrorState'
import EmptyState from '@/components/shared/EmptyState'
import { Badge } from '@/components/ui/badge'
import TaskCard from './TaskCard.jsx'
import { KANBAN_COLUMNS } from './utils/taskConstants.js'

export default function TaskBoardView({ items, loading, error, onRetry, onStatusChange, onOpen, isStatusPending, readOnly = false, emptyTitle = 'No tasks found', emptyDescription = 'Try adjusting filters or create a new task.' }) {
  if (loading) {
    return <div className="p-2"><LoadingState label="Loading tasks…" /></div>
  }
  if (error) {
    return <ErrorState title="Could not load tasks" message={error} onRetry={onRetry} />
  }
  if (!items.length) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        className="py-10"
      />
    )
  }

  return (
    <div className="tasks-board" aria-label="Task board">
      {KANBAN_COLUMNS.map((column) => {
        const columnItems = items.filter((t) => t.status === column.id)
        return (
          <section key={column.id} className="tasks-board-column" aria-label={`${column.label} column`}>
            <div className="tasks-board-column-header">
              <h3 className="text-[13px] font-semibold">{column.label}</h3>
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-medium">{columnItems.length}</Badge>
            </div>
            <div className="grid gap-2">
              {columnItems.length ? (
                columnItems.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    compact
                    onStatusChange={readOnly ? undefined : onStatusChange}
                    onOpen={onOpen}
                    busy={typeof isStatusPending === 'function' ? isStatusPending(task.id) : false}
                    readOnly={readOnly}
                  />
                ))
              ) : (
                <div className="rounded-[10px] border border-dashed border-border bg-background/60 px-3 py-4 text-center text-[12px] text-muted-foreground">
                  No tasks
                </div>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}
