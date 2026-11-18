import { useState } from 'react'
import { Link2, Plus, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import IconButton from '@/components/shared/IconButton.jsx'
import AddLinkDialog from './AddLinkDialog.jsx'

const TYPE_LABELS = {
  related: 'Related',
  reference: 'Reference',
  depends_on: 'Depends on',
}

function LinkRow({ link, label, busy, onOpen, onRemove }) {
  return (
    <li className="flex items-center gap-2 rounded-md px-1 py-1 transition-colors hover:bg-accent">
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left text-[13px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onClick={() => onOpen(link)}
      >
        <Link2 size={13} aria-hidden="true" className="shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <Badge variant="secondary" className="shrink-0 text-[10.5px]">
          {TYPE_LABELS[link.link_type] || link.link_type}
        </Badge>
      </button>
      <IconButton
        label={`Remove link to ${label}`}
        className="size-6"
        disabled={busy}
        onClick={() => onRemove(link)}
      >
        <X size={13} aria-hidden="true" />
      </IconButton>
    </li>
  )
}

/**
 * Explicit document links: outgoing ("Related") and incoming ("Backlinks").
 *
 * Link rows only carry document ids, so titles are resolved from the
 * workspace document list the page already loaded; anything outside it is
 * shown as its plain id — no fabricated titles.
 */
export default function LinksSection({
  document,
  links,
  documents,
  onCreateLink,
  onRemoveLink,
  onOpenDocument,
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [removingId, setRemovingId] = useState(null)
  const [removeError, setRemoveError] = useState('')

  const titleFor = (documentId) => {
    const found = (documents || []).find((item) => item.id === documentId)
    return found ? found.title : `Document #${documentId}`
  }

  async function handleCreate({ targetDocumentId, linkType }) {
    setBusy(true)
    setError('')
    try {
      await onCreateLink({ targetDocumentId, linkType })
      setShowAdd(false)
    } catch (caught) {
      setError(caught.message || 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(linkId) {
    setRemovingId(linkId)
    setRemoveError('')
    try {
      await onRemoveLink(linkId)
    } catch (caught) {
      setRemoveError(caught?.message || 'Could not remove the link.')
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <div className="grid gap-2">
      {/* Outgoing */}
      <div className="grid gap-1">
        <h4 className="text-[12px] font-medium text-muted-foreground">Related documents</h4>
        {links.data?.outgoing?.length ? (
          <ul>
            {links.data.outgoing.map((link) => (
              <LinkRow
                key={link.id}
                link={link}
                label={titleFor(link.target_document_id)}
                busy={removingId === link.id}
                onOpen={(item) => onOpenDocument(item.target_document_id)}
                onRemove={(item) => handleRemove(item.id)}
              />
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-muted-foreground">No outgoing links.</p>
        )}
      </div>

      {/* Incoming */}
      <div className="grid gap-1">
        <h4 className="text-[12px] font-medium text-muted-foreground">Backlinks</h4>
        {links.data?.incoming?.length ? (
          <ul>
            {links.data.incoming.map((link) => (
              <li key={link.id} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-accent">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left text-[13px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  onClick={() => onOpenDocument(link.source_document_id)}
                >
                  <Link2
                    size={13}
                    aria-hidden="true"
                    className="shrink-0 -scale-x-100 text-muted-foreground"
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {titleFor(link.source_document_id)}
                  </span>
                  <Badge variant="secondary" className="shrink-0 text-[10.5px]">
                    {TYPE_LABELS[link.link_type] || link.link_type}
                  </Badge>
                </button>
                {/* Removing a backlink requires write access on this document
                    too — the endpoint deletes by this document's id. */}
                <IconButton
                  label={`Remove backlink from ${titleFor(link.source_document_id)}`}
                  className="size-6"
                  disabled={removingId === link.id}
                  onClick={() => handleRemove(link.id)}
                >
                  <X size={13} aria-hidden="true" />
                </IconButton>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-muted-foreground">No backlinks yet.</p>
        )}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 w-fit gap-1.5 px-2 text-[12.5px] text-muted-foreground hover:text-foreground"
        onClick={() => setShowAdd(true)}
      >
        <Plus size={13} aria-hidden="true" />
        Add link
      </Button>

      {(error || removeError) && (
        <p role="alert" className="text-[12px] text-destructive">
          {error || removeError}
        </p>
      )}

      <AddLinkDialog
        open={showAdd}
        document={document}
        documents={documents}
        busy={busy}
        error={error}
        onClose={() => setShowAdd(false)}
        onCreate={handleCreate}
      />
    </div>
  )
}
