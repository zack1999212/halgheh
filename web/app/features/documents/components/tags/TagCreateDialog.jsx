import { useEffect, useState } from 'react'
import DialogShell from '@/components/shared/DialogShell'
import FormError from '@/components/shared/FormError'
import FormField, { fieldInputClass } from '@/components/shared/FormField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * Creates a workspace tag through POST /tags (name + hex color).
 *
 * The color uses the native color picker; the chosen value is a plain
 * `#rrggbb` string, exactly what the backend schema validates.
 */
export default function TagCreateDialog({ open, busy, error, onClose, onCreate }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('#2563eb')

  useEffect(() => {
    if (open) {
      setName('')
      setColor('#2563eb')
    }
  }, [open])

  const trimmed = name.trim()

  return (
    <DialogShell
      open={open}
      title="New tag"
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <Button type="button" variant="outline" className="h-9" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="create-tag-form"
            className="h-9"
            disabled={busy || !trimmed || !/^#[0-9a-fA-F]{6}$/.test(color)}
          >
            {busy ? 'Creating…' : 'Create'}
          </Button>
        </>
      }
    >
      <form
        id="create-tag-form"
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (trimmed && /^#[0-9a-fA-F]{6}$/.test(color)) {
            onCreate({ name: trimmed, color })
          }
        }}
      >
        <FormError>{error}</FormError>
        <FormField id="create-tag-name" label="Name">
          {(props) => (
            <Input
              {...props}
              className={fieldInputClass}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Important"
              maxLength={64}
              autoFocus
            />
          )}
        </FormField>
        <FormField
          id="create-tag-color"
          label="Color"
          hint="Used for the tag dot in lists and filters."
        >
          {(props) => (
            <div className="flex items-center gap-3">
              <input
                {...props}
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="size-9 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-1"
                aria-label="Tag color"
              />
              <Input
                className={`${fieldInputClass} font-mono`}
                value={color}
                onChange={(event) => {
                  const value = event.target.value.trim()
                  if (/^#[0-9a-fA-F]{0,6}$/.test(value)) {
                    setColor(value)
                  }
                }}
                aria-label="Tag color as hex value"
              />
            </div>
          )}
        </FormField>
      </form>
    </DialogShell>
  )
}
