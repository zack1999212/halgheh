import LoadingState from '@/components/shared/LoadingState'
import ErrorState from '@/components/shared/ErrorState'
import EmptyState from '@/components/shared/EmptyState'
import TaskCard from './TaskCard.jsx'

export default function TaskListView({ items, loading, error, onRetry, onStatusChange, onOpen, isStatusPending, readOnly = false, emptyTitle = 'No tasks found', emptyDescription = 'Try adjusting filters or create a new task.' }) {
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
    <div className="grid gap-3" aria-label="Task list">
      {items.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          onStatusChange={readOnly ? undefined : onStatusChange}
          onOpen={onOpen}
          busy={typeof isStatusPending === 'function' ? isStatusPending(task.id) : false}
          readOnly={readOnly}
        />
      ))}
    </div>
  )
}
