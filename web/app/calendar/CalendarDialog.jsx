import { useEffect, useState } from 'react'
import Modal from './Modal.jsx'

/**
 * Creates or edits a calendar. The backend creates a default "Personal"
 * calendar per user; that calendar cannot be deleted, so the delete action is
 * only offered for other calendars (the API also rejects it with a 409).
 */
export default function CalendarDialog({
  open,
  calendar,
  saving,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}) {
  const isEdit = Boolean(calendar)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }
    setName(calendar?.name || '')
    setDescription(calendar?.description || '')
    setError('')
    setConfirmingDelete(false)
    setBusy(false)
  }, [open, calendar])

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    const trimmed = name.trim()
    if (!trimmed) {
      setError('Calendar name is required.')
      return
    }
    if (trimmed.length > 100) {
      setError('Calendar name must be 100 characters or fewer.')
      return
    }

    setBusy(true)
    try {
      if (isEdit) {
        await onUpdate(calendar.id, {
          name: trimmed,
          description: description.trim() || null,
        })
      } else {
        await onCreate({ name: trimmed, description: description.trim() })
      }
      onClose()
    } catch (err) {
      setError(err?.message || 'Could not save the calendar.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    setError('')
    setBusy(true)
    try {
      await onDelete(calendar.id)
      onClose()
    } catch (err) {
      setError(err?.message || 'Could not delete the calendar.')
    } finally {
      setBusy(false)
    }
  }

  const disabled = busy || saving

  return (
    <Modal
      open={open}
      title={isEdit ? 'Calendar settings' : 'New calendar'}
      onClose={onClose}
      footer={
        <>
          {isEdit && !calendar?.is_default && (
            <button
              type="button"
              className="button-danger-ghost"
              onClick={() => setConfirmingDelete(true)}
              disabled={disabled}
            >
              Delete
            </button>
          )}
          <span className="dialog-footer-spacer" />
          <button
            type="button"
            className="button-secondary"
            onClick={onClose}
            disabled={disabled}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="calendar-form"
            className="button-primary"
            disabled={disabled}
          >
            {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create calendar'}
          </button>
        </>
      }
    >
      <form id="calendar-form" className="form" onSubmit={handleSubmit}>
        {error && (
          <div className="form-alert" role="alert">
            {error}
          </div>
        )}

        {confirmingDelete && (
          <div className="form-alert">
            <p>Delete “{calendar?.name}” and all of its events?</p>
            <div className="form-alert-actions">
              <button
                type="button"
                className="button-secondary"
                onClick={() => setConfirmingDelete(false)}
                disabled={disabled}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button-primary"
                onClick={handleDelete}
                disabled={disabled}
              >
                {busy ? 'Deleting…' : 'Delete calendar'}
              </button>
            </div>
          </div>
        )}

        <div className="form-field">
          <label className="form-label" htmlFor="calendar-name">
            Name
          </label>
          <input
            id="calendar-name"
            className="form-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={100}
            placeholder="Work"
            disabled={disabled}
            autoFocus
          />
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="calendar-description">
            Description <span className="form-optional">(optional)</span>
          </label>
          <textarea
            id="calendar-description"
            className="form-textarea"
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={disabled}
          />
        </div>

        {isEdit && calendar?.is_default && (
          <p className="form-hint">
            This is your default calendar. Create another calendar to move
            events there before deleting it.
          </p>
        )}
      </form>
    </Modal>
  )
}
