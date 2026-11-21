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

function displayFor(documentId, info, documents) {
  if (info?.title) {
    return {
      title: info.title,
      context: info.folder_name || null,
    }
  }
  const found = (documents || []).find((item) => item.id === documentId)
  if (found) {
    return { title: found.title, context: null }
  }
  return { title: `Document #${documentId}`, context: null }
}

function LinkRow({ link, label, context, busy, onOpen, onRemove, removeLabel }) {
  return (
    <li className="flex items-center gap-2 rounded-md px-1 py-1 transition-colors hover:bg-accent">
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left text-[13px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onClick={() => onOpen(link)}
      >
        <Link2 size={13} aria-hidden="true" className="shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block truncate">{label}</span>
          {context ? (
            <span className="block truncate text-[11px] text-muted-foreground">
              {context}
            </span>
          ) : null}
        </span>
        <Badge variant="secondary" className="shrink-0 text-[10.5px]">
          {TYPE_LABELS[link.link_type] || link.link_type}
        </Badge>
      </button>
      <IconButton
        label={removeLabel}
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
 * Explicit document links: outgoing and incoming (backlinks).
 *
 * Uses enriched link metadata from the API when available (title/folder
 * context), falling back to the loaded workspace document list. Inaccessible
 * or deleted linked documents are filtered out by the backend.
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

  const outgoing = links.data?.outgoing || []
  const incoming = links.data?.incoming || []
  const outgoingWiki = outgoing.filter((l) => l.link_type === 'reference').length
  const outgoingManual = outgoing.length - outgoingWiki

  return (
    <div className="grid gap-3">
      {/* Outgoing */}
      <div className="grid gap-1">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-[12px] font-medium text-muted-foreground">
            Outgoing links
          </h4>
          {outgoing.length ? (
            <span className="text-[11px] text-muted-foreground">
              {outgoingManual} manual · {outgoingWiki} wiki/reference
            </span>
          ) : null}
        </div>
        {outgoing.length ? (
          <ul>
            {outgoing.map((link) => {
              const info = displayFor(
                link.target_document_id,
                link.target_document,
                documents,
              )
              return (
                <LinkRow
                  key={link.id}
                  link={link}
                  label={info.title}
                  context={info.context}
                  busy={removingId === link.id}
                  onOpen={() => onOpenDocument(link.target_document_id)}
                  onRemove={() => handleRemove(link.id)}
                  removeLabel={`Remove link to ${info.title}`}
                />
              )
            })}
          </ul>
        ) : (
          <p className="text-[12px] text-muted-foreground">No outgoing links.</p>
        )}
      </div>

      {/* Incoming */}
      <div className="grid gap-1">
        <h4 className="text-[12px] font-medium text-muted-foreground">Backlinks</h4>
        {incoming.length ? (
          <ul>
            {incoming.map((link) => {
              const info = displayFor(
                link.source_document_id,
                link.source_document,
                documents,
              )
              return (
                <li
                  key={link.id}
                  className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-accent"
                >
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
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{info.title}</span>
                      {info.context ? (
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {info.context}
                        </span>
                      ) : null}
                    </span>
                    <Badge variant="secondary" className="shrink-0 text-[10.5px]">
                      {TYPE_LABELS[link.link_type] || link.link_type}
                    </Badge>
                  </button>
                  <IconButton
                    label={`Remove backlink from ${info.title}`}
                    className="size-6"
                    disabled={removingId === link.id}
                    onClick={() => handleRemove(link.id)}
                  >
                    <X size={13} aria-hidden="true" />
                  </IconButton>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-[12px] text-muted-foreground">No backlinks yet.</p>
        )}
      </div>

      <div className="grid gap-1">
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
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Wiki references (<code>[[Title]]</code>) are synced as <em>reference</em> links from document content. Titles that match multiple accessible documents are treated as ambiguous and are not connected automatically.
        </p>
      </div>

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
