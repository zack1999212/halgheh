import { CircleAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Inline error block with an optional retry action.
 *
 * Used for load failures inside cards, overlays and panels. It stays an Alert
 * so assistive technology announces it, and the retry button reuses the
 * destructive-outline treatment everywhere.
 */
export default function ErrorState({
  title,
  message,
  onRetry,
  retryLabel = 'Retry',
  className,
}) {
  return (
    <Alert variant="destructive" className={cn('text-left', className)}>
      <CircleAlert aria-hidden="true" />
      {title && (
        <AlertTitle className="text-[13px] font-medium">{title}</AlertTitle>
      )}
      <AlertDescription className="grid gap-2 text-[13px]">
        <p className="break-words">{message}</p>
        {onRetry && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-fit border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onRetry}
          >
            {retryLabel}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}
