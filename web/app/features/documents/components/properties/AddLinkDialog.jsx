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

const LINK_TYPES = [
  { value: 'related', label: 'Related' },
  { value: 'reference', label: 'Reference' },
  { value: 'depends_on', label: 'Depends on' },
]

/**
 * Creates an explicit link between documents through
 * POST /documents/{id}/links ({ target_document_id, link_type }).
 *
 * Targets come from the active workspace's document list; the backend
 * rejects self-links and duplicates with 400 / 409, which surface as the
 * dialog's error message.
 */
export default function AddLinkDialog({
  open,
  document,
  documents,
  busy,
  error,
  onClose,
  onCreate,
}) {
  const [targetId, setTargetId] = useState('')
  const [linkType, setLinkType] = useState('related')

  useEffect(() => {
    if (open) {
      setTargetId('')
      setLinkType('related')
    }
  }, [open])

  const candidates = (documents || []).filter((item) => item.id !== document?.id)

  return (
    <DialogShell
      open={open}
      title="Link a document"
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="outline" className="h-9" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="add-link-form"
            className="h-9"
            disabled={busy || !targetId}
          >
            {busy ? 'Linking…' : 'Add link'}
          </Button>
        </>
      }
    >
      <form
        id="add-link-form"
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (targetId) {
            onCreate({ targetDocumentId: Number(targetId), linkType })
          }
        }}
      >
        <FormError>{error}</FormError>
        <FormField
          id="add-link-target"
          label="Target document"
          hint={candidates.length ? undefined : 'No other documents in this workspace yet.'}
        >
          {(props) => (
            <Select
              value={targetId}
              onValueChange={setTargetId}
              disabled={busy || !candidates.length}
            >
              <SelectTrigger {...props} className="h-11 rounded-[var(--radius-md)]">
                <SelectValue placeholder="Choose a document" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((item) => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField id="add-link-type" label="Link type">
          {(props) => (
            <Select
              value={linkType}
              onValueChange={setLinkType}
              disabled={busy}
            >
              <SelectTrigger {...props} className="h-11 rounded-[var(--radius-md)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LINK_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
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
