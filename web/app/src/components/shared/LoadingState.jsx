import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * Loading state for a card or overlay: a short label plus two skeleton lines.
 * Tighter, multi-line skeletons stay local to the surface that needs them.
 */
export default function LoadingState({ label, className }) {
  return (
    <div
      className={cn('grid gap-2', className)}
      role="status"
      aria-live="polite"
    >
      {label && <p className="text-[12.5px] text-muted-foreground">{label}</p>}
      <Skeleton className="h-2.5 w-full" />
      <Skeleton className="mt-0 h-2.5 w-2/3" />
    </div>
  )
}
