import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

/**
 * Shared dialog shell: shadcn Dialog (focus trap, Escape, scroll lock) with the
 * Halgheh header/body/footer rhythm.
 *
 * The body scrolls independently so the footer stays reachable on short
 * viewports, and the dialog never grows past the viewport. `wide` widens the
 * shell for multi-column forms; `footer` is optional so read-only dialogs can
 * omit it. Every dialog in the application goes through this component so
 * spacing, close behaviour and mobile sizing stay identical.
 */
export default function DialogShell({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  wide = false,
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose()
        }
      }}
    >
      <DialogContent
        className={cn(
          'flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-1.5rem)] flex-col gap-0 overflow-hidden rounded-[var(--radius-lg)] border-border p-0 shadow-[var(--shadow-card)] sm:max-w-[560px]',
          wide && 'sm:max-w-[720px]',
        )}
      >
        <DialogHeader className="border-b border-border px-5 py-4 text-left sm:text-left">
          <DialogTitle className="text-[15px] font-semibold tracking-[-0.01em]">
            {title}
          </DialogTitle>
          <DialogDescription
            className={cn('text-[13px]', !description && 'sr-only')}
          >
            {description || title}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {footer && (
          <DialogFooter className="flex-row flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3 sm:justify-end sm:space-x-0">
            {footer}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
