import { TASK_NAV_ITEMS } from './utils/taskConstants.js'
import { cn } from '@/lib/utils'

export default function TasksSidebar({ activeId, onSelect }) {
  return (
    <aside className="tasks-nav" aria-label="Task views">
      <div className="tasks-nav-title">Views</div>
      <nav className="grid gap-1">
        {TASK_NAV_ITEMS.map((item) => {
          const active = item.id === activeId
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item)}
              className={cn(
                'flex w-full items-center justify-between rounded-[8px] px-2.5 py-2 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active
                  ? 'bg-foreground text-background shadow-sm'
                  : 'text-foreground hover:bg-accent/60',
              )}
              aria-current={active ? 'page' : undefined}
            >
              <span className="truncate">{item.label}</span>
            </button>
          )
        })}
      </nav>
      <p className="mt-3 px-2 text-[11px] leading-relaxed text-muted-foreground">
        Navigation uses views and filters supported by the current task API. Team-based views are not shown because no team endpoint is available.
      </p>
    </aside>
  )
}
