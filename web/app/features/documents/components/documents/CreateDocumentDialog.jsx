import { useEffect, useState } from 'react'
import DialogShell from '@/components/shared/DialogShell'
import FormError from '@/components/shared/FormError'
import FormField, { fieldInputClass } from '@/components/shared/FormField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/**
 * Creates a document in the current folder/workspace context.
 *
 * The backend requires a non-empty title (max 256 chars). When `workspaces`
 * are provided (project context), a workspace selection is required because
 * document creation is workspace-scoped in the backend schema.
 */
export default function CreateDocumentDialog({
  open,
  folderName,
  busy,
  error,
  onClose,
  onCreate,
  workspaces = null,
  workspaceId = '',
  onWorkspaceChange,
}) {
  const [title, setTitle] = useState('')

  useEffect(() => {
    if (open) {
      setTitle('')
    }
  }, [open])

  const trimmed = title.trim()
  const needsWorkspace = Array.isArray(workspaces)
  const canSubmit = Boolean(trimmed) && (!needsWorkspace || (workspaceId !== '' && workspaceId != null))

  return (
    <DialogShell
      open={open}
      title="New document"
      description={
        needsWorkspace
          ? 'Choose a workspace for this project document and enter a title.'
          : folderName
            ? `Created in "${folderName}".`
            : 'Created in the workspace root.'
      }
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
            disabled={busy || !canSubmit}
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
          if (!canSubmit) return
          const payload = { title: trimmed }
          if (needsWorkspace) payload.workspaceId = Number(workspaceId)
          onCreate(payload)
        }}
      >
        <FormError>{error}</FormError>
        {needsWorkspace && (
          <div className="grid gap-2">
            <Label htmlFor="create-document-workspace" className="text-[13px] font-medium">Vault</Label>
            <Select value={workspaceId === '' || workspaceId == null ? '' : String(workspaceId)} onValueChange={onWorkspaceChange}>
              <SelectTrigger id="create-document-workspace" className={fieldInputClass}>
                <SelectValue placeholder={workspaces.length ? 'Select a vault' : 'No vaults available'} />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map((ws) => (
                  <SelectItem key={ws.id} value={String(ws.id)}>{ws.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {workspaces.length === 0 && (
              <p className="text-[12px] text-muted-foreground">A vault is required to create a document. Create a vault first, then try again.</p>
            )}
          </div>
        )}
        <FormField id="create-document-title" label="Title">
          {(props) => (
            <Input
              {...props}
              className={fieldInputClass}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Untitled document"
              maxLength={256}
              autoFocus={!needsWorkspace}
            />
          )}
        </FormField>
      </form>
    </DialogShell>
  )
}
