import { useState } from 'react'
import { Check, LoaderCircle, Pencil, Plus, Trash2, X } from 'lucide-react'
import { formatConversationTime } from './format.js'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import IconButton from '@/components/shared/IconButton'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

/** Compact conversation switcher with inline rename and delete. */
export default function ConversationHistory({
  conversations,
  activeId,
  loading,
  onSelect,
  onNew,
  onRename,
  onDelete,
}) {
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState('')
  const [confirmingId, setConfirmingId] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')

  const confirming = conversations.find(
    (conversation) => conversation.id === confirmingId,
  )

  function startRename(conversation) {
    setError('')
    setConfirmingId(null)
    setEditingId(conversation.id)
    setDraft(conversation.title || '')
  }

  async function submitRename(event) {
    event.preventDefault()
    const title = draft.trim()
    if (!title || busyId) return
    setBusyId(editingId)
    setError('')
    const ok = await onRename(editingId, title)
    setBusyId(null)
    if (ok) {
      setEditingId(null)
      setDraft('')
    } else {
      setError('Could not rename this conversation.')
    }
  }

  async function confirmDelete(conversationId) {
    if (busyId) return
    setBusyId(conversationId)
    setError('')
    const ok = await onDelete(conversationId)
    setBusyId(null)
    if (ok) {
      setConfirmingId(null)
    } else {
      setError('Could not delete this conversation.')
    }
  }

  return (
    <section
      className="border-b border-border bg-muted/20"
      aria-label="Conversation history"
    >
      <div className="flex items-center justify-between gap-2 px-3 pt-2 pb-1">
        <span className="text-[10.5px] font-medium uppercase tracking-[0.07em] text-muted-foreground">
          Recent conversations
        </span>
        <IconButton
          label="Start a new conversation"
          tooltip="New conversation"
          className="size-6"
          onClick={onNew}
        >
          <Plus size={14} aria-hidden="true" />
        </IconButton>
      </div>

      {error && (
        <p className="px-3 pb-1.5 text-[11.5px] text-destructive" role="alert">
          {error}
        </p>
      )}

      {loading && conversations.length === 0 && (
        <p className="flex items-center gap-1.5 px-3 pb-2 text-[11.5px] text-muted-foreground">
          <LoaderCircle size={12} className="animate-spin" aria-hidden="true" />
          Loading conversations…
        </p>
      )}

      {!loading && conversations.length === 0 && (
        <p className="px-3 pb-2 text-[11.5px] text-muted-foreground">
          No conversations yet.
        </p>
      )}

      <ScrollArea className="max-h-[216px]">
        <ul className="flex flex-col gap-0.5 px-2 pb-2">
          {conversations.map((conversation) => {
            const isActive = conversation.id === activeId
            const isEditing = editingId === conversation.id

            return (
              <li
                key={conversation.id}
                className={cn(
                  'rounded-[var(--radius-sm)]',
                  isActive && 'bg-accent',
                )}
              >
                {isEditing ? (
                  <form
                    className="flex items-center gap-1 p-1"
                    onSubmit={submitRename}
                  >
                    <Input
                      className="h-7 min-w-0 flex-1 px-2 text-[12px]"
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      maxLength={200}
                      aria-label="Conversation title"
                      autoFocus
                    />
                    <IconButton
                      type="submit"
                      label="Save title"
                      disabled={!draft.trim() || busyId === conversation.id}
                    >
                      <Check size={14} aria-hidden="true" />
                    </IconButton>
                    <IconButton
                      label="Cancel rename"
                      onClick={() => {
                        setEditingId(null)
                        setDraft('')
                      }}
                    >
                      <X size={14} aria-hidden="true" />
                    </IconButton>
                  </form>
                ) : (
                  <div className="flex items-center gap-0.5 pr-1">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-left transition-colors hover:bg-accent/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      onClick={() => onSelect(conversation.id)}
                      aria-current={isActive ? 'true' : undefined}
                    >
                      <span className="w-full truncate text-[12px] font-medium">
                        {conversation.title || 'Untitled conversation'}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatConversationTime(conversation.updated_at)}
                      </span>
                    </button>
                    <IconButton
                      label={`Rename ${conversation.title || 'conversation'}`}
                      tooltip="Rename"
                      onClick={() => startRename(conversation)}
                    >
                      <Pencil size={12} aria-hidden="true" />
                    </IconButton>
                    <IconButton
                      label={`Delete ${conversation.title || 'conversation'}`}
                      tooltip="Delete"
                      className="hover:text-destructive"
                      onClick={() => {
                        setError('')
                        setEditingId(null)
                        setConfirmingId(conversation.id)
                      }}
                    >
                      <Trash2 size={12} aria-hidden="true" />
                    </IconButton>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </ScrollArea>

      <ConfirmDialog
        open={Boolean(confirming)}
        title="Delete conversation"
        description={`“${confirming?.title || 'Untitled conversation'}” and its messages will be removed. This cannot be undone.`}
        confirmLabel="Delete"
        busyLabel="Deleting…"
        busy={busyId === confirmingId}
        error={error}
        onConfirm={() => confirmDelete(confirmingId)}
        onClose={() => {
          if (!busyId) setConfirmingId(null)
        }}
      />
    </section>
  )
}
