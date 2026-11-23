import { useEffect, useState } from 'react'
import DialogShell from '@/components/shared/DialogShell'
import FormError from '@/components/shared/FormError'
import FormField, { fieldInputClass } from '@/components/shared/FormField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

/**
 * Creates a vault through POST /workspaces (name, optional description).
 * Owns its busy/error state so the opener stays simple.
 */
export default function WorkspaceCreateDialog({ open, onClose, onCreate }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setName('')
      setDescription('')
      setError('')
    }
  }, [open])

  const trimmed = name.trim()

  async function handleSubmit(event) {
    event.preventDefault()
    if (!trimmed) return
    setBusy(true)
    setError('')
    try {
      await onCreate({ name: trimmed, description: description.trim() || null })
      onClose()
    } catch (caught) {
      setError(caught.message || 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogShell
      open={open}
      title="New vault"
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="outline" className="h-9" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="create-vault-form"
            className="h-9"
            disabled={busy || !trimmed}
          >
            {busy ? 'Creating…' : 'Create'}
          </Button>
        </>
      }
    >
      <form id="create-vault-form" className="grid gap-4" onSubmit={handleSubmit}>
        <FormError>{error}</FormError>
        <FormField id="create-vault-name" label="Vault name">
          {(props) => (
            <Input
              {...props}
              className={fieldInputClass}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="My vault"
              maxLength={128}
              autoFocus
            />
          )}
        </FormField>
        <FormField id="create-vault-description" label="Description" optional>
          {(props) => (
            <Textarea
              {...props}
              className="min-h-[76px] rounded-[var(--radius-md)] px-3 py-2 text-base md:text-[15px]"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional description"
            />
          )}
        </FormField>
      </form>
    </DialogShell>
  )
}
