import { useEffect, useState } from 'react'
import DialogShell from '@/components/shared/DialogShell'
import FormError from '@/components/shared/FormError'
import FormField, { fieldInputClass } from '@/components/shared/FormField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * Creates a document in the current folder (or the workspace root).
 *
 * The backend requires a non-empty title (max 256 chars) and creates the
 * document with empty Markdown content.
 */
export default function CreateDocumentDialog({
  open,
  folderName,
  busy,
  error,
  onClose,
  onCreate,
}) {
  const [title, setTitle] = useState('')

  useEffect(() => {
    if (open) {
      setTitle('')
    }
  }, [open])

  const trimmed = title.trim()

  return (
    <DialogShell
      open={open}
      title="New document"
      description={folderName ? `Created in "${folderName}".` : 'Created in the workspace root.'}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="outline" className="h-9" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="create-document-form"
            className="h-9"
            disabled={busy || !trimmed}
          >
            {busy ? 'Creating…' : 'Create'}
          </Button>
        </>
      }
    >
      <form
        id="create-document-form"
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (trimmed) {
            onCreate({ title: trimmed })
          }
        }}
      >
        <FormError>{error}</FormError>
        <FormField id="create-document-title" label="Title">
          {(props) => (
            <Input
              {...props}
              className={fieldInputClass}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Untitled document"
              maxLength={256}
              autoFocus
            />
          )}
        </FormField>
      </form>
    </DialogShell>
  )
}
