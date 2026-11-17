import { useEffect, useState } from 'react'
import DialogShell from '@/components/shared/DialogShell'
import FormError from '@/components/shared/FormError'
import FormField, {
  fieldInputClass,
} from '@/components/shared/FormField'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

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
    <DialogShell
      open={open}
      contentClassName="cal-dialog"
      title={isEdit ? 'Calendar settings' : 'New calendar'}
      onClose={onClose}
      footer={
        <>
          {isEdit && !calendar?.is_default && (
            <Button
              type="button"
              variant="ghost"
              className="mr-auto h-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setConfirmingDelete(true)}
              disabled={disabled}
            >
              Delete
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className="h-9"
            onClick={onClose}
            disabled={disabled}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="calendar-form"
            className="h-9"
            disabled={disabled}
          >
            {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create calendar'}
          </Button>
        </>
      }
    >
      <form id="calendar-form" className="grid gap-4" onSubmit={handleSubmit}>
        <FormError>{error}</FormError>

        {confirmingDelete && (
          <Alert className="border-destructive/30 bg-destructive/5">
            <div className="grid gap-3">
              <p className="text-[13px] text-foreground">
                Delete “{calendar?.name}” and all of its events?
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={disabled}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="h-8"
                  onClick={handleDelete}
                  disabled={disabled}
                >
                  {busy ? 'Deleting…' : 'Delete calendar'}
                </Button>
              </div>
            </div>
          </Alert>
        )}

        <FormField id="calendar-name" label="Name">
          {(field) => (
            <Input
              {...field}
              className={fieldInputClass}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              placeholder="Work"
              disabled={disabled}
              autoFocus
            />
          )}
        </FormField>

        <FormField
          id="calendar-description"
          label="Description"
          optional
        >
          {(field) => (
            <Textarea
              {...field}
              className={cn(
                'min-h-[84px] rounded-[var(--radius-md)] px-3 py-2 text-base md:text-[15px]',
              )}
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={disabled}
            />
          )}
        </FormField>

        {isEdit && calendar?.is_default && (
          <p className="text-[12.5px] text-muted-foreground">
            This is your default calendar. Create another calendar to move
            events there before deleting it.
          </p>
        )}
      </form>
    </DialogShell>
  )
}
