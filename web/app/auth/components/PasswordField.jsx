import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import FormField, {
  fieldInputClass,
  fieldInvalidClass,
} from '@/components/shared/FormField'
import { cn } from '@/lib/utils'

/** Password input with an accessible show/hide visibility toggle. */
export default function PasswordField({
  label,
  error,
  hint,
  id,
  className,
  ...inputProps
}) {
  const [visible, setVisible] = useState(false)

  return (
    <FormField id={id} label={label} error={error} hint={hint}>
      {(field) => (
        <div className="relative">
          <Input
            {...field}
            type={visible ? 'text' : 'password'}
            className={cn(
              fieldInputClass,
              'pr-12',
              error && fieldInvalidClass,
              className,
            )}
            {...inputProps}
          />

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setVisible((current) => !current)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-pressed={visible}
            disabled={inputProps.disabled}
            className="absolute right-1.5 top-1/2 size-8 -translate-y-1/2 rounded-[var(--radius-sm)] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          </Button>
        </div>
      )}
    </FormField>
  )
}
