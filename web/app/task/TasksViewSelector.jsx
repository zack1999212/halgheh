import { LayoutGrid, List } from 'lucide-react'
import { Button } from '@/components/ui/button'

const VIEWS = [
  { id: 'list', label: 'List', icon: List },
  { id: 'kanban', label: 'Kanban', icon: LayoutGrid },
]

export default function TasksViewSelector({ view, onChange }) {
  return (
    <div
      role="group"
      aria-label="Task view"
      className="tasks-control-group inline-flex items-center gap-0.5"
    >
      {VIEWS.map((option) => {
        const Icon = option.icon
        const active = view === option.id
        return (
          <Button
            key={option.id}
            type="button"
            size="sm"
            variant={active ? 'default' : 'ghost'}
            aria-pressed={active}
            onClick={() => onChange(option.id)}
            className="h-7 gap-1.5 rounded-[calc(var(--radius-md)-2px)] px-2.5 text-[12.5px] font-medium"
          >
            <Icon size={14} aria-hidden="true" />
            {option.label}
          </Button>
        )
      })}
    </div>
  )
}
