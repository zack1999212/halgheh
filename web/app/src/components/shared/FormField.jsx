import { useId } from 'react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/** Input sizing shared by every text field, in forms and dialogs alike. */
export const fieldInputClass =
  'h-11 rounded-[var(--radius-md)] px-3 text-base md:text-[15px]'

/** Border/ring used when a field is invalid. */
export const fieldInvalidClass =
  'border-destructive/40 focus-visible:ring-destructive/30'

/** Hint/error line under a field. */
export function FieldMessage({ error, hint, id, className }) {
  const message = error || hint
  if (!message) {
    return null
  }

  return (
    <p
      id={id}
      role={error ? 'alert' : undefined}
      className={cn(
        'text-[12.5px]',
        error ? 'text-destructive' : 'text-muted-foreground',
        className,
      )}
    >
      {message}
    </p>
  )
}

/**
 * Label + control + hint/error layout for a single form field.
 *
 * `children` is called with the props the control must spread (`id` plus the
 * `aria-invalid` / `aria-describedby` wiring) so association and error
 * announcements are never forgotten. Errors take precedence over hints.
 */
export default function FormField({
  id,
  label,
  optional = false,
  hint,
  error,
  className,
  children,
}) {
  const generatedId = useId()
  const fieldId = id || `field-${generatedId}`
  const messageId = `${fieldId}-message`
  const hasMessage = Boolean(error || hint)

  return (
    <div className={cn('grid gap-2', className)}>
      <Label htmlFor={fieldId} className="text-[13px] font-medium">
        {label}
        {optional && (
          <span className="font-normal text-muted-foreground"> (optional)</span>
        )}
      </Label>

      {children({
        id: fieldId,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': hasMessage ? messageId : undefined,
      })}

      <FieldMessage id={messageId} error={error} hint={hint} />
    </div>
  )
}
