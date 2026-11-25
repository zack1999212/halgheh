import { useCallback, useEffect, useState } from 'react'
import {
  Check,
  Pencil,
  Pin,
  Send,
  Smile,
  Trash2,
} from 'lucide-react'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import FormError from '@/components/shared/FormError'
import { useToast } from '@/components/shared/ToastProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { formatRelativeTime } from '../notifications/format.js'
import {
  addDiscussionReaction,
  addReplyReaction,
  createReply,
  deleteDiscussion,
  deleteReply,
  listReplies,
  pinDiscussion,
  removeDiscussionReaction,
  removeReplyReaction,
  updateDiscussion,
  updateReply,
} from './api.js'

const EMOJIS = ['👍', '❤️', '🎉', '👀']

function ReactionBar({ reactions = [], viewer = [], busy, onToggle }) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const active = new Set(viewer)

  return (
    <div className="discussion-reactions">
      {reactions.map((reaction) => (
        <button
          key={reaction.emoji}
          type="button"
          className={`discussion-reaction${active.has(reaction.emoji) ? ' is-active' : ''}`}
          onClick={() => onToggle(reaction.emoji)}
          disabled={busy}
          aria-label={`${active.has(reaction.emoji) ? 'Remove' : 'Add'} ${reaction.emoji} reaction`}
          aria-pressed={active.has(reaction.emoji)}
        >
          <span aria-hidden="true">{reaction.emoji}</span>
          <span>{reaction.count}</span>
        </button>
      ))}
      <button
        type="button"
        className="discussion-reaction discussion-reaction--add"
        onClick={() => setPickerOpen((current) => !current)}
        aria-expanded={pickerOpen}
        aria-label="Add reaction"
      >
        <Smile size={13} aria-hidden="true" />
      </button>
      {pickerOpen && (
        <div className="discussion-emoji-picker">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onToggle(emoji)
                setPickerOpen(false)
              }}
              disabled={busy}
              aria-label={`React with ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Full thread: the post, its reactions, and all messages/replies. */
export default function DiscussionThread({
  workspaceId,
  discussion,
  currentUserId,
  canPin,
  onUpdated,
  onDeleted,
}) {
  const toast = useToast()
  const [replies, setReplies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [reactionBusy, setReactionBusy] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const [editingPost, setEditingPost] = useState(false)
  const [postTitle, setPostTitle] = useState(discussion.title)
  const [postContent, setPostContent] = useState(discussion.content)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const loadReplies = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await listReplies(workspaceId, discussion.id, { limit: 100 })
      setReplies(Array.isArray(data?.items) ? data.items : [])
    } catch (err) {
      setError(err?.message || 'Could not load messages.')
    } finally {
      setLoading(false)
    }
  }, [workspaceId, discussion.id])

  useEffect(() => {
    loadReplies()
  }, [loadReplies])

  useEffect(() => {
    setText('')
    setEditingId(null)
    setEditingPost(false)
    setPostTitle(discussion.title)
    setPostContent(discussion.content)
  }, [discussion.id, discussion.title, discussion.content])

  const isAuthor = discussion.author_id === currentUserId

  async function handleReply(event) {
    event.preventDefault()
    const content = text.trim()
    if (!content || busy) return
    setBusy(true)
    setError('')
    try {
      const created = await createReply(workspaceId, discussion.id, { content })
      setReplies((current) => [...current, created])
      setText('')
      onUpdated?.({
        ...discussion,
        reply_count: (discussion.reply_count || 0) + 1,
      })
    } catch (err) {
      setError(err?.message || 'Could not add your message.')
    } finally {
      setBusy(false)
    }
  }

  async function handleUpdateReply(reply) {
    const content = editText.trim()
    if (!content || busy) return
    setBusy(true)
    try {
      const updated = await updateReply(workspaceId, discussion.id, reply.id, { content })
      setReplies((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      setEditingId(null)
    } catch (err) {
      setError(err?.message || 'Could not update your message.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteReply(reply) {
    setBusy(true)
    try {
      const updated = await deleteReply(workspaceId, discussion.id, reply.id)
      setReplies((current) => current.map((item) => (item.id === updated.id ? updated : item)))
    } catch (err) {
      setError(err?.message || 'Could not delete your message.')
    } finally {
      setBusy(false)
    }
  }

  async function handleToggleReaction(emoji) {
    if (reactionBusy) return
    const active = (discussion.viewer_reactions || []).includes(emoji)
    setReactionBusy(true)
    try {
      const result = active
        ? await removeDiscussionReaction(workspaceId, discussion.id, emoji)
        : await addDiscussionReaction(workspaceId, discussion.id, emoji)
      onUpdated?.({
        ...discussion,
        reactions: result.reactions,
        viewer_reactions: result.viewer_reactions,
      })
    } catch (err) {
      setError(err?.message || 'Could not update your reaction.')
    } finally {
      setReactionBusy(false)
    }
  }

  async function handleToggleReplyReaction(reply, emoji) {
    if (reactionBusy) return
    const active = (reply.viewer_reactions || []).includes(emoji)
    setReactionBusy(true)
    try {
      const result = active
        ? await removeReplyReaction(workspaceId, discussion.id, reply.id, emoji)
        : await addReplyReaction(workspaceId, discussion.id, reply.id, emoji)
      setReplies((current) =>
        current.map((item) =>
          item.id === reply.id
            ? { ...item, reactions: result.reactions, viewer_reactions: result.viewer_reactions }
            : item,
        ),
      )
    } catch (err) {
      setError(err?.message || 'Could not update your reaction.')
    } finally {
      setReactionBusy(false)
    }
  }

  async function handleUpdatePost(event) {
    event.preventDefault()
    if (busy || !postTitle.trim() || !postContent.trim()) return
    setBusy(true)
    try {
      const updated = await updateDiscussion(workspaceId, discussion.id, {
        title: postTitle.trim(),
        content: postContent.trim(),
      })
      onUpdated?.(updated)
      setEditingPost(false)
      toast.success('Discussion updated')
    } catch (err) {
      setError(err?.message || 'Could not update the discussion.')
    } finally {
      setBusy(false)
    }
  }

  async function handlePin() {
    if (busy) return
    setBusy(true)
    try {
      const updated = await pinDiscussion(workspaceId, discussion.id, !discussion.is_pinned)
      onUpdated?.(updated)
    } catch (err) {
      setError(err?.message || 'Could not pin the discussion.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDeletePost() {
    setDeleteBusy(true)
    try {
      await deleteDiscussion(workspaceId, discussion.id)
      setConfirmDelete(false)
      onDeleted?.(discussion.id)
      toast.success('Discussion deleted')
    } catch (err) {
      setError(err?.message || 'Could not delete the discussion.')
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className="discussion-thread">
      <div className="discussion-thread-head">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            {discussion.type === 'announcement' ? 'Announcement' : 'Discussion'}
          </Badge>
          {discussion.is_pinned && (
            <Badge variant="secondary" className="text-[10px]">
              <Pin size={10} aria-hidden="true" /> Pinned
            </Badge>
          )}
          <span className="text-[11px] text-muted-foreground">
            {discussion.author?.name || discussion.author?.username || 'Member'} ·{' '}
            {formatRelativeTime(discussion.created_at)}
          </span>
        </div>

        {editingPost ? (
          <form className="grid gap-2" onSubmit={handleUpdatePost}>
            <Input
              value={postTitle}
              onChange={(event) => setPostTitle(event.target.value)}
              maxLength={255}
              aria-label="Discussion title"
            />
            <Textarea
              value={postContent}
              onChange={(event) => setPostContent(event.target.value)}
              rows={4}
              maxLength={10000}
              aria-label="Discussion content"
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={busy}>Save</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setEditingPost(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <>
            <h2 className="text-[17px] font-semibold tracking-[-0.01em]">
              {discussion.title}
            </h2>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed">
              {discussion.content}
            </p>
          </>
        )}

        <div className="discussion-thread-actions">
          <ReactionBar
            reactions={discussion.reactions}
            viewer={discussion.viewer_reactions}
            busy={reactionBusy}
            onToggle={handleToggleReaction}
          />
          <div className="ml-auto flex flex-wrap gap-1">
            {canPin && (
              <Button type="button" variant="ghost" size="sm" onClick={handlePin} disabled={busy}>
                <Pin size={13} aria-hidden="true" />
                {discussion.is_pinned ? 'Unpin' : 'Pin'}
              </Button>
            )}
            {isAuthor && !editingPost && (
              <>
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditingPost(true)}>
                  <Pencil size={13} aria-hidden="true" />
                  Edit
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
                  <Trash2 size={13} aria-hidden="true" />
                  Delete
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <FormError>{error}</FormError>

      <div className="discussion-messages">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {replies.length} {replies.length === 1 ? 'message' : 'messages'}
        </h3>
        {loading ? (
          <p className="text-[12px] text-muted-foreground">Loading messages…</p>
        ) : replies.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">
            No messages yet. Start the conversation.
          </p>
        ) : (
          <ul className="discussion-message-list">
            {replies.map((reply) => {
              const own = reply.author_id === currentUserId
              return (
                <li key={reply.id} className={`discussion-message${reply.is_deleted ? ' is-deleted' : ''}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-semibold">
                      {reply.is_deleted
                        ? 'Deleted'
                        : reply.author?.name || reply.author?.username || 'Member'}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {formatRelativeTime(reply.created_at)}
                    </span>
                  </div>

                  {editingId === reply.id ? (
                    <div className="grid gap-2">
                      <Textarea
                        value={editText}
                        onChange={(event) => setEditText(event.target.value)}
                        rows={3}
                        aria-label="Edit message"
                      />
                      <div className="flex gap-2">
                        <Button type="button" size="sm" onClick={() => handleUpdateReply(reply)} disabled={busy}>
                          <Check size={13} aria-hidden="true" /> Save
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap text-[13px]">
                      {reply.is_deleted ? 'This message was deleted.' : reply.content}
                    </p>
                  )}

                  {!reply.is_deleted && (
                    <div className="discussion-message-actions">
                      <ReactionBar
                        reactions={reply.reactions}
                        viewer={reply.viewer_reactions}
                        busy={reactionBusy}
                        onToggle={(emoji) => handleToggleReplyReaction(reply, emoji)}
                      />
                      {own && (
                        <div className="ml-auto flex gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            onClick={() => {
                              setEditingId(reply.id)
                              setEditText(reply.content || '')
                            }}
                            aria-label="Edit message"
                          >
                            <Pencil size={13} aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            onClick={() => handleDeleteReply(reply)}
                            disabled={busy}
                            aria-label="Delete message"
                          >
                            <Trash2 size={13} aria-hidden="true" />
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <form className="discussion-compose" onSubmit={handleReply}>
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Add a message…"
          rows={2}
          maxLength={10000}
          aria-label="New message"
        />
        <Button type="submit" disabled={!text.trim() || busy}>
          <Send size={14} aria-hidden="true" />
          Send
        </Button>
      </form>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete discussion?"
        description="Your discussion and its messages will be removed."
        busy={deleteBusy}
        onConfirm={handleDeletePost}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  )
}
