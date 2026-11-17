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
          className="ml-auto h-8 gap-1.5"
          onClick={onCreateEvent}
          disabled={!canCreate}
          title={canCreate ? undefined : 'Create a calendar first'}
        >
          <Plus size={15} aria-hidden="true" />
          Create event
        </Button>
      </div>

      {/* Navigation toolbar — prev, today, next, range, view selector */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8"
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
            variant="outline"
            size="sm"
            className="h-8"
            onClick={onToday}
          >
            Today
          </Button>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8"
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
          className="min-w-0 truncate text-[13px] text-muted-foreground"
          aria-live="polite"
        >
          {rangeLabel}
        </p>

        <div className="ml-auto">
          <CalendarViewSelector view={view} onChange={onViewChange} />
        </div>
      </div>
    </div>
  )
}
