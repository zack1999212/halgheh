import { cn } from '@/lib/utils'

/**
 * Radio rendered as a full-width selectable card: title, one line of detail and
 * a native radio input. Used wherever a choice has consequences the user must
 * read first (recurrence scope, delete scope, move scope).
 *
 * The checked styling is CSS-driven through `has-[:checked]`, so the card
 * follows the input even before React re-renders, and keyboard users get the
 * native radio behaviour unchanged.
 */
export default function RadioOption({
  name,
  value,
  title,
  description,
  checked,
  onChange,
  disabled = false,
  className,
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border border-border p-3 transition-colors',
        'hover:bg-accent/50 has-[:checked]:border-foreground/25 has-[:checked]:bg-accent',
        disabled && 'cursor-default opacity-60 hover:bg-transparent',
        className,
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="mt-0.5 size-3.5 shrink-0 accent-foreground"
      />
      <span className="grid gap-0.5">
        <span className="text-[13px] font-medium">{title}</span>
        {description && (
          <span className="text-[12px] leading-relaxed text-muted-foreground">
            {description}
          </span>
        )}
      </span>
    </label>
  )
}
