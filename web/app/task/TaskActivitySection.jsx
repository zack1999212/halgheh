import { formatDateTime } from './utils/taskFormat.js'

function describeActivity(item) {
  const action = item.action || 'activity'
  const labels = {
    task_created: 'Task created',
    task_updated: 'Task updated',
    priority_changed: 'Priority changed',
    due_date_changed: 'Dates changed',
    status_changed: 'Status changed',
    assignee_added: 'Assignee added',
    assignee_removed: 'Assignee removed',
    comment_added: 'Comment added',
    label_added: 'Label added',
    label_removed: 'Label removed',
    task_deleted: 'Task deleted',
  }
  return labels[action] || action.replace(/_/g, ' ')
}

export default function TaskActivitySection({ activities, error }) {
  return (
    <section className="grid gap-3" aria-labelledby="task-activity-title">
      <h3 id="task-activity-title" className="text-[13px] font-semibold">Activity history</h3>
      {error && <p className="text-[12.5px] text-destructive" role="alert">{error}</p>}
      {activities.length === 0 ? (
        <p className="text-[12.5px] text-muted-foreground">No activity recorded yet.</p>
      ) : (
        <ul className="grid gap-2">
          {activities.map((item) => (
            <li key={item.id ?? `${item.action}-${item.created_at}`} className="rounded-[var(--radius-md)] border border-border bg-card px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] font-medium text-foreground">{describeActivity(item)}</p>
                {item.created_at && <time className="text-[11px] text-muted-foreground" dateTime={item.created_at}>{formatDateTime(item.created_at)}</time>}
              </div>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Actor: {item.actor_id != null ? `User #${item.actor_id}` : 'Unknown'}
              </p>
              {(item.old_value || item.new_value) && (
                <div className="mt-1 grid gap-0.5 text-[11.5px] text-muted-foreground">
                  {item.old_value && <p><span className="font-medium">From:</span> <span className="break-all">{item.old_value}</span></p>}
                  {item.new_value && <p><span className="font-medium">To:</span> <span className="break-all">{item.new_value}</span></p>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
