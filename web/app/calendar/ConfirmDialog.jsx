import Modal from './Modal.jsx'

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  busy = false,
  error = '',
  onConfirm,
  onClose,
  children,
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <button
            type="button"
            className="button-secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button-primary"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Deleting…' : confirmLabel}
          </button>
        </>
      }
    >
      {error && (
        <div className="form-alert" role="alert">
          {error}
        </div>
      )}
      {description && <p className="form-paragraph">{description}</p>}
      {children}
    </Modal>
  )
}
