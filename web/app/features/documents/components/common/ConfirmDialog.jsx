import Dialog from './Dialog.jsx'

/** Confirmation dialog for destructive or important actions. */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  return (
    <Dialog
      open={open}
      title={title}
      onClose={busy ? () => {} : onCancel}
      footer={
        <>
          <button
            type="button"
            className="docs-btn docs-btn--secondary"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`docs-btn ${danger ? 'docs-btn--danger' : 'docs-btn--primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      <p className="docs-confirm-message">{message}</p>
    </Dialog>
  )
}
