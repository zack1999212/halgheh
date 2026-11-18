import { useEffect, useState } from 'react'
import DialogShell from '@/components/shared/DialogShell'
import FormError from '@/components/shared/FormError'
import FormField, { fieldInputClass } from '@/components/shared/FormField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * Create / rename folder dialog for POST /folders and PATCH /folders/{id}
 * ({ name }). `folder` present means rename; `parentName` labels creation.
 */
export default function FolderDialog({
  open,
  folder,
  parentName,
  busy,
  error,
  onClose,
  onSubmit,
}) {
  const isRename = Boolean(folder)
  const [name, setName] = useState('')

  useEffect(() => {
    if (open) {
      setName(folder?.name || '')
    }
  }, [open, folder])

  const trimmed = name.trim()

  return (
    <DialogShell
      open={open}
      title={isRename ? 'Rename folder' : 'New folder'}
      description={
        isRename
          ? undefined
          : parentName
            ? `Created inside "${parentName}".`
            : 'Created at the workspace root.'
      }
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="outline" className="h-9" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="folder-form"
            className="h-9"
            disabled={busy || !trimmed || (isRename && trimmed === folder?.name)}
          >
            {busy ? 'Saving…' : isRename ? 'Rename' : 'Create'}
          </Button>
        </>
      }
    >
      <form
        id="folder-form"
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (!trimmed) return
          if (isRename && trimmed === folder.name) return
          onSubmit({ name: trimmed })
        }}
      >
        <FormError>{error}</FormError>
        <FormField id="folder-name" label="Name">
          {(props) => (
            <Input
              {...props}
              className={fieldInputClass}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Project notes"
              maxLength={128}
              autoFocus
            />
          )}
        </FormField>
      </form>
    </DialogShell>
  )
}
