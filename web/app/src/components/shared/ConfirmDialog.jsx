import { Button } from '@/components/ui/button'
import DialogShell from './DialogShell.jsx'
import FormError from './FormError.jsx'

/**
 * Confirmation dialog shared by destructive and scope-changing actions.
 *
 * The confirm button is destructive by default; pass `destructive={false}` for
 * non-destructive confirmations. `busy` locks dismissal and both buttons so a
 * slow request cannot be submitted twice, and `error` renders inside the dialog
 * so the user can retry without losing context.
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  busyLabel = 'Saving…',
  busy = false,
  error = '',
  destructive = true,
  onConfirm,
  onClose,
  children,
}) {
  return (
    <DialogShell
      open={open}
      title={title}
      description={description}
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            className="h-9"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={destructive ? 'destructive' : 'default'}
            className="h-9"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? busyLabel : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <FormError>{error}</FormError>
        {children}
      </div>
    </DialogShell>
  )
}
