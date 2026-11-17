import { FREQUENCY_OPTIONS, WEEKDAYS } from './recurrence.js'
import {
  FieldMessage,
  fieldInputClass,
} from '@/components/shared/FormField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'


/** Radix Select cannot hold an empty value, so "no repeat" uses a sentinel. */
const NO_REPEAT = 'NONE'

export default function RecurrenceFields({
  value,
  onChange,
  isAllDay,
  disabled = false,
  error = '',
}) {
  function update(partial) {
    onChange({ ...value, ...partial })
  }

  function toggleDay(code) {
    const next = value.byDay.includes(code)
      ? value.byDay.filter((day) => day !== code)
      : [...value.byDay, code]
    update({ byDay: next })
  }

  const unit = {
    DAILY: 'day',
    WEEKLY: 'week',
    MONTHLY: 'month',
    YEARLY: 'year',
  }[value.frequency]

  return (
    <section className="grid gap-3">
      <h3 className="text-[13px] font-semibold">Repeat</h3>

      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="grid gap-2">
          <Label htmlFor="event-frequency" className="text-[13px] font-medium">
            Frequency
          </Label>
          <Select
            value={value.frequency || NO_REPEAT}
            disabled={disabled}
            onValueChange={(next) => {
              const frequency = next === NO_REPEAT ? '' : next
              update({
                frequency,
                byDay:
                  frequency === 'WEEKLY' && value.byDay.length === 0
                    ? []
                    : value.byDay,
              })
            }}
          >
            <SelectTrigger id="event-frequency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FREQUENCY_OPTIONS.map((option) => (
                <SelectItem
                  key={option.value || NO_REPEAT}
                  value={option.value || NO_REPEAT}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {value.frequency && (
          <div className="grid gap-2">
            <Label htmlFor="event-interval" className="text-[13px] font-medium">
              Every
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="event-interval"
                className={cn(fieldInputClass, 'w-20')}
                type="number"
                min="1"
                max="99"
                value={value.interval}
                disabled={disabled}
                onChange={(event) => update({ interval: event.target.value })}
              />
              <span className="text-[13px] text-muted-foreground">
                {unit}
                {Number(value.interval) === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        )}
      </div>

      {value.frequency === 'WEEKLY' && (
        <div className="grid gap-2">
          <span className="text-[13px] font-medium">On</span>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((day) => {
              const active = value.byDay.includes(day.code)
              return (
                <Button
                  key={day.code}
                  type="button"
                  size="sm"
                  variant={active ? 'default' : 'outline'}
                  className="h-8 min-w-9 px-2 text-[12.5px]"
                  aria-pressed={active}
                  disabled={disabled}
                  onClick={() => toggleDay(day.code)}
                >
                  {day.label}
                </Button>
              )
            })}
          </div>
        </div>
      )}

      {value.frequency && (
        <div className="grid gap-2">
          <span className="text-[13px] font-medium">Ends</span>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="radio"
                name="recurrence-end"
                className="size-3.5 accent-foreground"
                checked={value.endMode === 'never'}
                disabled={disabled}
                onChange={() => update({ endMode: 'never' })}
              />
              Never
            </label>
            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="radio"
                name="recurrence-end"
                className="size-3.5 accent-foreground"
                checked={value.endMode === 'until'}
                disabled={disabled}
                onChange={() => update({ endMode: 'until' })}
              />
              On date
            </label>
            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="radio"
                name="recurrence-end"
                className="size-3.5 accent-foreground"
                checked={value.endMode === 'count'}
                disabled={disabled}
                onChange={() => update({ endMode: 'count' })}
              />
              After
            </label>
          </div>

          {value.endMode === 'until' && (
            <Input
              type="date"
              className={cn(fieldInputClass, 'w-fit')}
              value={value.untilDate}
              disabled={disabled}
              onChange={(event) => update({ untilDate: event.target.value })}
              aria-label="Repeat until date"
            />
          )}

          {value.endMode === 'count' && (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="1"
                className={cn(fieldInputClass, 'w-24')}
                value={value.count}
                disabled={disabled}
                onChange={(event) => update({ count: event.target.value })}
                aria-label="Number of occurrences"
              />
              <span className="text-[13px] text-muted-foreground">times</span>
            </div>
          )}
        </div>
      )}

      <FieldMessage id="event-recurrence-error" error={error} />
      {value.frequency && (
        <p className="text-[12.5px] text-muted-foreground">
          Rules are stored as RFC 5545 RRULEs
          {isAllDay ? ' using date-only UNTIL values' : ''}.
        </p>
      )}
    </section>
  )
}
