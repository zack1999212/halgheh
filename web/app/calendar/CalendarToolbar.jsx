import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import CalendarSelector from './CalendarSelector.jsx'
import CalendarViewSelector from './CalendarViewSelector.jsx'
import { periodName } from './views.js'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export default function CalendarToolbar({
  view,
  rangeLabel,
  onPrev,
  onNext,
  onToday,
  onViewChange,
  calendars = [],
  selectedCalendarId,
  calendarsLoading = false,
  calendarsError = '',
  onSelectCalendar,
  onRetryCalendars,
  onCreateCalendar,
  onManageCalendars,
  canCreate = false,
  onCreateEvent,
}) {
  const period = periodName(view)

  return (
    <div className="flex flex-col gap-3">
      {/* Primary header — title, calendar selector, create event */}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-1 text-[15px] font-semibold tracking-[-0.01em]">
          Calendar
        </h2>

        <CalendarSelector
          calendars={calendars}
          selectedId={selectedCalendarId}
          loading={calendarsLoading}
          error={calendarsError}
          onSelect={onSelectCalendar}
          onRetry={onRetryCalendars}
          onCreate={onCreateCalendar}
          onManage={onManageCalendars}
        />

        <Button
          type="button"
          size="sm"
          className="cal-primary-btn ml-auto h-8 gap-1.5"
          onClick={onCreateEvent}
          disabled={!canCreate}
          title={canCreate ? undefined : 'Create a calendar first'}
        >
          <Plus size={15} aria-hidden="true" />
          Create event
        </Button>
      </div>

      {/* Navigation toolbar — prev/today/next grouped, month label, view selector */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="cal-control-group flex items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 rounded-[calc(var(--radius-sm)-2px)]"
                onClick={onPrev}
                aria-label={`Previous ${period}`}
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Previous {period}</TooltipContent>
          </Tooltip>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 rounded-[calc(var(--radius-sm)-2px)] px-2.5 text-[13px]"
            onClick={onToday}
          >
            Today
          </Button>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 rounded-[calc(var(--radius-sm)-2px)]"
                onClick={onNext}
                aria-label={`Next ${period}`}
              >
                <ChevronRight size={16} aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Next {period}</TooltipContent>
          </Tooltip>
        </div>

        <p
          className="min-w-0 flex-1 truncate text-sm font-semibold tracking-[-0.01em] text-foreground"
          aria-live="polite"
        >
          {rangeLabel}
        </p>

        <div className="ml-auto flex items-center">
          <CalendarViewSelector view={view} onChange={onViewChange} />
        </div>
      </div>
    </div>
  )
}
