import { useState } from 'react'
import {
  Check,
  LoaderCircle,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { formatConversationTime } from './format.js'

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
    <div className="ca-history" role="dialog" aria-label="Conversation history">
      <header className="ca-history-head">
        <span className="ca-history-heading">Recent conversations</span>
        <button
          type="button"
          className="ca-icon-btn"
          onClick={onNew}
          aria-label="Start a new conversation"
          title="New conversation"
        >
          <Plus size={15} aria-hidden="true" />
        </button>
      </header>

      {error && (
        <p className="ca-history-error" role="alert">
          {error}
        </p>
      )}

      {loading && conversations.length === 0 && (
        <p className="ca-history-empty">
          <LoaderCircle size={13} className="ca-spin" aria-hidden="true" />
          Loading conversations…
        </p>
      )}

      {!loading && conversations.length === 0 && (
        <p className="ca-history-empty">No conversations yet.</p>
      )}

      <ul className="ca-history-list">
        {conversations.map((conversation) => {
          const isActive = conversation.id === activeId
          const isEditing = editingId === conversation.id
          const isConfirming = confirmingId === conversation.id

          return (
            <li
              key={conversation.id}
              className={`ca-history-row${isActive ? ' is-active' : ''}`}
            >
              {isEditing ? (
                <form className="ca-history-edit" onSubmit={submitRename}>
                  <input
                    className="ca-history-input"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    maxLength={200}
                    aria-label="Conversation title"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="ca-icon-btn"
                    disabled={!draft.trim() || busyId === conversation.id}
                    aria-label="Save title"
                  >
                    <Check size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="ca-icon-btn"
                    onClick={() => {
                      setEditingId(null)
                      setDraft('')
                    }}
                    aria-label="Cancel rename"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </form>
              ) : (
                <>
                  <button
                    type="button"
                    className="ca-history-select"
                    onClick={() => onSelect(conversation.id)}
                    aria-current={isActive ? 'true' : undefined}
                  >
                    <span className="ca-history-name">
                      {conversation.title || 'Untitled conversation'}
                    </span>
                    <span className="ca-history-time">
                      {formatConversationTime(conversation.updated_at)}
                    </span>
                  </button>
                  <span className="ca-history-actions">
                    <button
                      type="button"
                      className="ca-icon-btn"
                      onClick={() => startRename(conversation)}
                      aria-label={`Rename ${conversation.title || 'conversation'}`}
                      title="Rename"
                    >
                      <Pencil size={12} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="ca-icon-btn"
                      onClick={() => {
                        setError('')
                        setEditingId(null)
                        setConfirmingId(
                          isConfirming ? null : conversation.id,
                        )
                      }}
                      aria-label={`Delete ${conversation.title || 'conversation'}`}
                      title="Delete"
                    >
                      <Trash2 size={12} aria-hidden="true" />
                    </button>
                  </span>
                </>
              )}

              {isConfirming && !isEditing && (
                <div className="ca-history-confirm">
                  <span>Delete this conversation?</span>
                  <div className="ca-history-confirm-actions">
                    <button
                      type="button"
                      className="ca-btn ca-btn--ghost ca-btn--small"
                      onClick={() => setConfirmingId(null)}
                      disabled={busyId === conversation.id}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="ca-btn ca-btn--solid ca-btn--small"
                      onClick={() => confirmDelete(conversation.id)}
                      disabled={busyId === conversation.id}
                    >
                      {busyId === conversation.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
