import { useEffect, useState } from 'react'
import DialogShell from '@/components/shared/DialogShell'
import FormError from '@/components/shared/FormError'
import FormField, { fieldInputClass } from '@/components/shared/FormField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/** Renames a document through PATCH /documents/{id} ({ title }). */
export default function RenameDocumentDialog({
  open,
  document,
  busy,
  error,
  onClose,
  onRename,
}) {
  const [title, setTitle] = useState('')

  useEffect(() => {
    if (open) {
      setTitle(document?.title || '')
    }
  }, [open, document])

  const trimmed = title.trim()

  return (
    <DialogShell
      open={open}
      title="Rename document"
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="outline" className="h-9" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="rename-document-form"
            className="h-9"
            disabled={busy || !trimmed || trimmed === document?.title}
          >
            {busy ? 'Saving…' : 'Rename'}
          </Button>
        </>
      }
    >
      <form
        id="rename-document-form"
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (trimmed && trimmed !== document?.title) {
            onRename(trimmed)
          }
        }}
      >
        <FormError>{error}</FormError>
        <FormField id="rename-document-title" label="Title">
          {(props) => (
            <Input
              {...props}
              className={fieldInputClass}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={256}
              autoFocus
            />
          )}
        </FormField>
      </form>
    </DialogShell>
  )
}
