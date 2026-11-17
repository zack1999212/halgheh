import { Input } from '@/components/ui/input'
import FormField, {
  fieldInputClass,
  fieldInvalidClass,
} from '@/components/shared/FormField'
import { cn } from '@/lib/utils'

/** Single-line text input with a label, optional hint and inline error. */
export default function TextField({
  label,
  optional = false,
  error,
  hint,
  id,
  className,
  ...inputProps
}) {
  return (
    <FormField
      id={id}
      label={label}
      optional={optional}
      error={error}
      hint={hint}
    >
      {(field) => (
        <Input
          {...field}
          className={cn(
            fieldInputClass,
            error && fieldInvalidClass,
            className,
          )}
          {...inputProps}
        />
      )}
    </FormField>
  )
}
