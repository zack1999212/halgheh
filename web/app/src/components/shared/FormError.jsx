import { CircleAlert } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'

/**
 * Form- and action-level error message.
 *
 * Renders nothing without a message, so callers can pass an empty string
 * unconditionally. Built on the destructive shadcn Alert so submission errors
 * look the same in every form and dialog.
 */
export default function FormError({ children, className }) {
  if (!children) {
    return null
  }

  return (
    <Alert
      variant="destructive"
      className={cn('px-3 py-2.5 text-[13px]', className)}
    >
      <CircleAlert aria-hidden="true" />
      <AlertDescription className="text-[13px]">{children}</AlertDescription>
    </Alert>
  )
}
