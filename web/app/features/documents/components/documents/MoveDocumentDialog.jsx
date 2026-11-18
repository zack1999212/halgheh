import { useEffect, useState } from 'react'
import DialogShell from '@/components/shared/DialogShell'
import FormError from '@/components/shared/FormError'
import FormField from '@/components/shared/FormField'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/** Depth-first flatten of a folder tree into indented select options. */
function flattenFolders(nodes, depth = 0, result = []) {
  for (const node of nodes || []) {
    result.push({ id: node.id, name: node.name, depth })
    flattenFolders(node.children, depth + 1, result)
  }
  return result
}

/**
 * Moves a document to a folder of the active workspace (or back to the
 * workspace root) through PATCH /documents/{id} ({ folder_id }).
 *
 * Sending `null` as folder_id is meaningful: it is the backend's
 * "move to workspace root" value.
 */
export default function MoveDocumentDialog({
  open,
  document,
  folders,
  busy,
  error,
  onClose,
  onMove,
}) {
  const [folderId, setFolderId] = useState('root')
  const options = flattenFolders(folders)

  useEffect(() => {
    if (open) {
      setFolderId(document?.folder_id ? String(document.folder_id) : 'root')
    }
  }, [open, document])

  return (
    <DialogShell
      open={open}
      title="Move document"
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="outline" className="h-9" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="move-document-form"
            className="h-9"
            disabled={busy}
          >
            {busy ? 'Moving…' : 'Move'}
          </Button>
        </>
      }
    >
      <form
        id="move-document-form"
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          onMove(folderId === 'root' ? null : Number(folderId))
        }}
      >
        <FormError>{error}</FormError>
        <FormField
          id="move-document-folder"
          label="Destination folder"
          hint={options.length ? undefined : 'This workspace has no folders yet.'}
        >
          {(props) => (
            <Select
              value={folderId}
              onValueChange={setFolderId}
              disabled={busy || !options.length}
            >
              <SelectTrigger {...props} className="h-11 rounded-[var(--radius-md)]">
                <SelectValue placeholder="Choose a folder" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="root">Workspace root</SelectItem>
                {options.map((folder) => (
                  <SelectItem
                    key={folder.id}
                    value={String(folder.id)}
                    className="pl-2"
                    textValue={folder.name}
                  >
                    <span
                      className="flex items-center gap-1.5 text-left"
                      style={{ paddingLeft: folder.depth * 14 }}
                    >
                      <span className="text-[12px] text-muted-foreground">
                        {folder.depth > 0 ? '↳' : ''}
                      </span>
                      {folder.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      </form>
    </DialogShell>
  )
}
