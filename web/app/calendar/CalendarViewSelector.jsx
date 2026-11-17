import { CALENDAR_VIEWS } from './views.js'
import { Button } from '@/components/ui/button'

export default function CalendarViewSelector({ view, onChange }) {
  return (
    <div
      role="group"
      aria-label="Calendar view"
      className="cal-control-group inline-flex items-center gap-0.5 p-0.5"
    >
      {CALENDAR_VIEWS.map((option) => {
        const active = view === option.id
        return (
          <Button
            key={option.id}
            type="button"
            size="sm"
            variant={active ? 'default' : 'ghost'}
            aria-pressed={active}
            onClick={() => onChange(option.id)}
            className="h-7 rounded-[calc(var(--radius-md)-2px)] px-2.5 text-[12.5px] font-medium"
          >
            {option.label}
          </Button>
        )
      })}
    </div>
  )
}
