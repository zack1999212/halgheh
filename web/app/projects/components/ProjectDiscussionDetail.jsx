import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarClock, MessageSquare, MoreHorizontal, Pencil, Pin, PinOff, Send, Trash2, X } from 'lucide-react'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import FormError from '@/components/shared/FormError'
import LoadingState from '@/components/shared/LoadingState'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  addProjectDiscussionReaction,
  addProjectDiscussionReplyReaction,
  createProjectDiscussionReply,
  deleteProjectDiscussion,
  deleteProjectDiscussionReply,
  getProjectDiscussion,
  listProjectDiscussionReplies,
  pinProjectDiscussion,
  removeProjectDiscussionReaction,
  removeProjectDiscussionReplyReaction,
  updateProjectDiscussionReply,
} from '../api.js'
import { formatActivityDateTime, formatRelativeTime } from '../utils/projectFormat.js'
import ProjectReactionBar from './ProjectReactionBar.jsx'

function initials(author) {
  const src = (author?.name || author?.username || '').trim()
  if (!src) return '?'
  const parts = src.split(/\s+/).filter(Boolean).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() || '').join('') || '?'
}

function authorName(author, fallback = 'Unknown member') {
  return author?.name?.trim() || author?.username?.trim() || fallback
}

function canManageContent(role) {
  return role === 'owner' || role === 'admin' || role === 'editor'
}

function ReplyRow({ reply, role, currentUserId, busy, onToggleReaction, onEdit, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(reply?.content || '')
  const [saving, setSaving] = useState(false)
  const [localError, setLocalError] = useState('')

  useEffect(() => {
    setDraft(reply?.content || '')
    setEditing(false)
    setLocalError('')
  }, [reply?.id, reply?.content, reply?.is_deleted])

  if (reply?.is_deleted) {
    return (
      <div className="rounded-2xl border border-dashed border-[#E7E1D8] bg-[#F7F5F1] px-4 py-4">
        <p className="text-[13px] italic text-[#8A847B]">This reply was deleted.</p>
        <p className="mt-1 text-[12px] text-[#8A847B]">{formatRelativeTime(reply?.created_at)}</p>
      </div>
    )
  }

  const isAuthor = currentUserId != null && reply?.author_id === currentUserId
  const isOwner = role === 'owner'
  const canEdit = isAuthor || isOwner
  const canDelete = isAuthor || isOwner

  async function saveEdit() {
    const content = draft.trim()
    if (!content || busy || saving) return
    setSaving(true)
    setLocalError('')
    try {
      await onEdit(reply, content)
      setEditing(false)
    } catch (err) {
      setLocalError(err?.message || 'Could not update the reply.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-[#E7E1D8] bg-[#F7F5F1] px-4 py-4 shadow-[0_1px_2px_rgba(25,25,25,0.02)] sm:px-5">
      <div className="flex items-start gap-3">
        <Avatar className="size-9 shrink-0 border border-[#E7E1D8] bg-white">
          <AvatarFallback className="bg-[#EFEAE1] text-[11px] font-semibold text-[#5F5A51]">{initials(reply?.author)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[13px] font-semibold text-[#191919]">{authorName(reply?.author)}</span>
            <span className="text-[12px] text-[#8A847B]">{formatRelativeTime(reply?.created_at)}</span>
            {reply?.updated_at && reply?.updated_at !== reply?.created_at ? (
              <span className="text-[11px] text-[#8A847B]">(edited)</span>
            ) : null}
          </div>

          {editing ? (
            <div className="mt-3 grid gap-2">
              <FormError>{localError}</FormError>
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="min-h-[100px] rounded-xl border-[#E7E1D8] bg-white px-3 py-2.5 text-[14px] text-[#191919] shadow-[inset_0_1px_2px_rgba(25,25,25,0.02)] focus-visible:ring-[#FFC400]/30"
                maxLength={10000}
                disabled={saving}
              />
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" className="project-3d-btn-dark h-8 rounded-lg px-3" onClick={saveEdit} disabled={saving || !draft.trim()}>Save</Button>
                <Button type="button" variant="ghost" size="sm" className="h-8 rounded-lg text-[#6B665F]" onClick={() => { setEditing(false); setDraft(reply?.content || ''); setLocalError('') }} disabled={saving}>Cancel</Button>
              </div>
            </div>
          ) : (
            <p className="mt-2 whitespace-pre-wrap break-words text-[14px] leading-relaxed text-[#3D3935]">{reply?.content}</p>
          )}

          <div className="mt-3">
            <ProjectReactionBar
              reactions={reply?.reactions || []}
              canReact={canManageContent(role)}
              disabled={busy}
              compact
              onToggle={(emoji, active) => onToggleReaction(reply, emoji, active)}
            />
          </div>
        </div>

        {(canEdit || canDelete) && !editing && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0 rounded-lg text-[#8A847B] hover:bg-white hover:text-[#191919]" aria-label="Reply actions">
                <MoreHorizontal size={15} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40 rounded-xl border-[#E7E1D8] shadow-[0_8px_24px_rgba(25,25,25,0.08)]">
              {canEdit && <DropdownMenuItem onSelect={() => setEditing(true)}><Pencil size={14} /> Edit</DropdownMenuItem>}
              {canEdit && canDelete && <DropdownMenuSeparator />}
              {canDelete && <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => onDelete(reply)}><Trash2 size={14} /> Delete</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}

export default function ProjectDiscussionDetail({
  open,
  projectId,
  discussionId,
  role,
  currentUserId,
  refreshKey = 0,
  onClose,
  onChanged,
  onEditDiscussion,
  onUnauthorized,
}) {
  const [discussion, setDiscussion] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [replies, setReplies] = useState([])
  const [repliesTotal, setRepliesTotal] = useState(0)
  const [repliesLoading, setRepliesLoading] = useState(false)
  const [repliesError, setRepliesError] = useState('')
  const [replyDraft, setReplyDraft] = useState('')
  const [replyBusy, setReplyBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [confirmDeleteDiscussion, setConfirmDeleteDiscussion] = useState(false)
  const [replyToDelete, setReplyToDelete] = useState(null)
  const replyOffsetRef = useRef(0)

  const canWrite = canManageContent(role)
  const isOwner = role === 'owner'
  const isAdmin = role === 'admin'
  const canPin = isOwner || isAdmin

  const loadDiscussion = useCallback(async () => {
    if (!open || !projectId || !discussionId) return
    setLoading(true)
    setError('')
    try {
      const data = await getProjectDiscussion(projectId, discussionId)
      setDiscussion(data)
    } catch (err) {
      if (err?.status === 401) { onUnauthorized?.(); return }
      setError(err?.message || 'Could not load the discussion.')
      setDiscussion(null)
    } finally {
      setLoading(false)
    }
  }, [open, projectId, discussionId, onUnauthorized])

  const loadReplies = useCallback(async ({ reset = false } = {}) => {
    if (!open || !projectId || !discussionId) return
    const offset = reset ? 0 : replyOffsetRef.current
    setRepliesLoading(true)
    setRepliesError('')
    try {
      const data = await listProjectDiscussionReplies(projectId, discussionId, { limit: 20, offset })
      const incoming = Array.isArray(data?.items) ? data.items : []
      setRepliesTotal(Number.isFinite(data?.total) ? data.total : incoming.length)
      setReplies((prev) => {
        const base = reset ? [] : prev
        const seen = new Set(base.map((r) => r.id))
        const merged = [...base]
        for (const r of incoming) {
          if (seen.has(r.id)) continue
          seen.add(r.id)
          merged.push(r)
        }
        return merged
      })
      replyOffsetRef.current = offset + incoming.length
    } catch (err) {
      if (err?.status === 401) { onUnauthorized?.(); return }
      setRepliesError(err?.message || 'Could not load replies.')
      if (reset) { setReplies([]); setRepliesTotal(0); replyOffsetRef.current = 0 }
    } finally {
      setRepliesLoading(false)
    }
  }, [open, projectId, discussionId, onUnauthorized])

  useEffect(() => {
    if (!open) return
    setDiscussion(null)
    setReplies([])
    setRepliesTotal(0)
    replyOffsetRef.current = 0
    setReplyDraft('')
    setActionError('')
    setRepliesError('')
    loadDiscussion()
    loadReplies({ reset: true })
  }, [open, projectId, discussionId, refreshKey, loadDiscussion, loadReplies])

  const canEditDiscussion = useMemo(() => {
    if (!discussion) return false
    return isOwner || (currentUserId != null && discussion.author_id === currentUserId)
  }, [discussion, isOwner, currentUserId])

  const canDeleteDiscussion = canEditDiscussion
  const hasMoreReplies = replies.length < repliesTotal

  async function handleToggleDiscussionReaction(emoji, active) {
    if (!discussion || actionBusy) return
    setActionBusy(true)
    setActionError('')
    try {
      const res = active
        ? await removeProjectDiscussionReaction(projectId, discussionId, { emoji })
        : await addProjectDiscussionReaction(projectId, discussionId, { emoji })
      setDiscussion((prev) => prev ? { ...prev, reactions: res.reactions || [], viewer_reactions: res.viewer_reactions || [] } : prev)
      onChanged?.()
    } catch (err) {
      if (err?.status === 401) { onUnauthorized?.(); return }
      setActionError(err?.message || 'Could not update reaction.')
    } finally {
      setActionBusy(false)
    }
  }

  async function handleToggleReplyReaction(reply, emoji, active) {
    if (actionBusy) return
    setActionBusy(true)
    setActionError('')
    try {
      const res = active
        ? await removeProjectDiscussionReplyReaction(projectId, discussionId, reply.id, { emoji })
        : await addProjectDiscussionReplyReaction(projectId, discussionId, reply.id, { emoji })
      setReplies((prev) => prev.map((r) => r.id === reply.id ? { ...r, reactions: res.reactions || [], viewer_reactions: res.viewer_reactions || [] } : r))
    } catch (err) {
      if (err?.status === 401) { onUnauthorized?.(); return }
      setActionError(err?.message || 'Could not update reaction.')
    } finally {
      setActionBusy(false)
    }
  }

  async function handleCreateReply() {
    const content = replyDraft.trim()
    if (!content || replyBusy) return
    setReplyBusy(true)
    setActionError('')
    try {
      const created = await createProjectDiscussionReply(projectId, discussionId, { content })
      setReplies((prev) => [...prev, created])
      replyOffsetRef.current += 1
      setRepliesTotal((t) => t + 1)
      setReplyDraft('')
      setDiscussion((prev) => prev ? { ...prev, reply_count: (prev.reply_count || 0) + 1 } : prev)
      onChanged?.()
    } catch (err) {
      if (err?.status === 401) { onUnauthorized?.(); return }
      setActionError(err?.message || 'Could not post the reply.')
    } finally {
      setReplyBusy(false)
    }
  }

  async function handleEditReply(reply, content) {
    const updated = await updateProjectDiscussionReply(projectId, discussionId, reply.id, { content })
    setReplies((prev) => prev.map((r) => r.id === reply.id ? updated : r))
  }

  async function handleDeleteReplyConfirmed() {
    if (!replyToDelete) return
    setActionBusy(true)
    setActionError('')
    try {
      const updated = await deleteProjectDiscussionReply(projectId, discussionId, replyToDelete.id)
      setReplies((prev) => prev.map((r) => r.id === replyToDelete.id ? updated : r))
      setDiscussion((prev) => prev ? { ...prev, reply_count: Math.max(0, (prev.reply_count || 0) - 1) } : prev)
      setReplyToDelete(null)
      onChanged?.()
    } catch (err) {
      if (err?.status === 401) { onUnauthorized?.(); return }
      setActionError(err?.message || 'Could not delete the reply.')
    } finally {
      setActionBusy(false)
    }
  }

  async function handlePinToggle() {
    if (!discussion || !canPin || actionBusy) return
    setActionBusy(true)
    setActionError('')
    try {
      const updated = await pinProjectDiscussion(projectId, discussionId, { is_pinned: !discussion.is_pinned })
      setDiscussion(updated)
      onChanged?.()
    } catch (err) {
      if (err?.status === 401) { onUnauthorized?.(); return }
      setActionError(err?.message || 'Could not update pin state.')
    } finally {
      setActionBusy(false)
    }
  }

  async function handleDeleteDiscussionConfirmed() {
    if (!discussion) return
    setActionBusy(true)
    setActionError('')
    try {
      await deleteProjectDiscussion(projectId, discussionId)
      setConfirmDeleteDiscussion(false)
      onChanged?.()
      onClose?.()
    } catch (err) {
      if (err?.status === 401) { onUnauthorized?.(); return }
      setActionError(err?.message || 'Could not delete the discussion.')
    } finally {
      setActionBusy(false)
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => { if (!next) onClose?.() }}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 border-l border-[#E7E1D8] bg-[#FBFAF8] p-0 shadow-[-12px_0_40px_rgba(25,25,25,0.08)] sm:max-w-[760px] [&>button]:hidden">
          <div className="flex items-center justify-between border-b border-[#E7E1D8] bg-white px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8A847B]">Discussion</p>
            </div>
            <div className="flex items-center gap-1.5">
              {canPin && discussion ? (
                <Button type="button" variant="outline" size="sm" className="h-9 rounded-xl border-[#E7E1D8] bg-white text-[#5F5A51] hover:bg-[#F7F5F1] hover:text-[#191919]" onClick={handlePinToggle} disabled={actionBusy}>
                  {discussion.is_pinned ? <PinOff size={14} /> : <Pin size={14} />}
                  {discussion.is_pinned ? 'Unpin' : 'Pin'}
                </Button>
              ) : null}
              {(canEditDiscussion || canDeleteDiscussion) && discussion ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" size="icon" className="size-9 rounded-xl border-[#E7E1D8] bg-white text-[#5F5A51] hover:bg-[#F7F5F1] hover:text-[#191919]" aria-label="Discussion actions"><MoreHorizontal size={16} /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44 rounded-xl border-[#E7E1D8] shadow-[0_8px_24px_rgba(25,25,25,0.08)]">
                    {canEditDiscussion && <DropdownMenuItem onSelect={() => onEditDiscussion?.(discussion)}><Pencil size={14} /> Edit</DropdownMenuItem>}
                    {canEditDiscussion && canDeleteDiscussion && <DropdownMenuSeparator />}
                    {canDeleteDiscussion && <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfirmDeleteDiscussion(true)}><Trash2 size={14} /> Delete</DropdownMenuItem>}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
              <Button type="button" variant="ghost" size="icon" className="size-9 rounded-xl text-[#6B665F] hover:bg-[#F7F5F1] hover:text-[#191919]" onClick={onClose} aria-label="Close"><X size={16} /></Button>
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="grid gap-5 px-5 py-5 sm:px-6 sm:py-6">
              {loading ? (
                <LoadingState label="Loading discussion…" />
              ) : error ? (
                <ErrorState message={error} onRetry={loadDiscussion} />
              ) : discussion ? (
                <>
                  <div className="rounded-2xl border border-[#E7E1D8] bg-white p-5 shadow-[0_1px_2px_rgba(25,25,25,0.04),0_8px_24px_rgba(25,25,25,0.04)] sm:p-6">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn(
                        'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold',
                        discussion.type === 'announcement'
                          ? 'bg-[#FFC400] text-[#191919]'
                          : 'border border-[#E7E1D8] bg-[#F7F5F1] text-[#5F5A51]',
                      )}>
                        {discussion.type === 'announcement' ? 'Announcement' : 'Discussion'}
                      </span>
                      {discussion.is_pinned ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#E8DDB7] bg-[#FFF8DE] px-2.5 py-1 text-[11px] font-medium text-[#7A6200]">
                          <Pin size={12} /> Pinned
                        </span>
                      ) : null}
                    </div>

                    <SheetHeader className="mt-4 space-y-3 text-left">
                      <SheetTitle className="text-[24px] font-semibold tracking-[-0.03em] text-[#191919] sm:text-[28px]">{discussion.title}</SheetTitle>
                      <SheetDescription asChild>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-[#6B665F]">
                          <span className="inline-flex items-center gap-2">
                            <Avatar className="size-6 border border-[#E7E1D8]"><AvatarFallback className="bg-[#EFEAE1] text-[9px] text-[#5F5A51]">{initials(discussion.author)}</AvatarFallback></Avatar>
                            <span className="font-medium text-[#3D3935]">{authorName(discussion.author)}</span>
                          </span>
                          <span className="inline-flex items-center gap-1.5"><CalendarClock size={13} /> {formatActivityDateTime(discussion.created_at)}</span>
                          {discussion.updated_at && discussion.updated_at !== discussion.created_at ? <span className="text-[#8A847B]">Updated {formatRelativeTime(discussion.updated_at)}</span> : null}
                        </div>
                      </SheetDescription>
                    </SheetHeader>

                    <div className="mt-5 rounded-2xl border border-[#E7E1D8] bg-[#F7F5F1] px-4 py-4 sm:px-5">
                      <p className="whitespace-pre-wrap break-words text-[14px] leading-7 text-[#3D3935] sm:text-[15px]">{discussion.content}</p>
                    </div>

                    <div className="mt-4">
                      <ProjectReactionBar
                        reactions={discussion.reactions || []}
                        canReact={canWrite}
                        disabled={actionBusy}
                        onToggle={handleToggleDiscussionReaction}
                      />
                    </div>
                    <FormError>{actionError}</FormError>
                  </div>

                  <div className="rounded-2xl border border-[#E7E1D8] bg-white p-5 shadow-[0_1px_2px_rgba(25,25,25,0.04),0_8px_24px_rgba(25,25,25,0.04)] sm:p-6">
                    <div className="mb-4 flex items-center justify-between gap-2">
                      <h3 className="flex items-center gap-2 text-[15px] font-semibold text-[#191919]">
                        <MessageSquare size={16} className="text-[#8A847B]" /> Replies
                        <span className="rounded-full bg-[#F7F5F1] px-2 py-0.5 text-[12px] font-medium text-[#6B665F]">{repliesTotal}</span>
                      </h3>
                    </div>

                    {repliesLoading && replies.length === 0 ? (
                      <div className="grid gap-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl bg-[#F0ECE4]" />)}</div>
                    ) : repliesError && replies.length === 0 ? (
                      <ErrorState message={repliesError} onRetry={() => loadReplies({ reset: true })} />
                    ) : replies.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-[#E7E1D8] bg-[#F7F5F1] p-5">
                        <EmptyState icon={MessageSquare} title="No replies yet" description={canWrite ? 'Start the conversation with the first reply.' : 'No replies have been posted yet.'} />
                      </div>
                    ) : (
                      <div className="grid gap-3">
                        {replies.map((reply) => (
                          <ReplyRow
                            key={reply.id}
                            reply={reply}
                            role={role}
                            currentUserId={currentUserId}
                            busy={actionBusy}
                            onToggleReaction={handleToggleReplyReaction}
                            onEdit={handleEditReply}
                            onDelete={(r) => setReplyToDelete(r)}
                          />
                        ))}
                        {repliesError ? <ErrorState message={repliesError} onRetry={() => loadReplies({ reset: false })} /> : null}
                        {hasMoreReplies ? (
                          <div className="flex justify-center pt-1">
                            <Button type="button" variant="outline" size="sm" className="h-9 rounded-xl border-[#E7E1D8] bg-white px-4 text-[#5F5A51] hover:bg-[#F7F5F1]" onClick={() => loadReplies({ reset: false })} disabled={repliesLoading}>
                              {repliesLoading ? 'Loading…' : 'Load more replies'}
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    )}

                    {canWrite ? (
                      <div className="mt-5 grid gap-3 rounded-2xl border border-[#E7E1D8] bg-[#F7F5F1] p-4 sm:p-5">
                        <label htmlFor="discussion-reply-draft" className="text-[13px] font-medium text-[#191919]">Add a reply</label>
                        <Textarea
                          id="discussion-reply-draft"
                          value={replyDraft}
                          onChange={(e) => setReplyDraft(e.target.value)}
                          className="min-h-[104px] rounded-xl border-[#E7E1D8] bg-white px-3 py-2.5 text-[14px] text-[#191919] shadow-[inset_0_1px_2px_rgba(25,25,25,0.02)] focus-visible:ring-[#FFC400]/30"
                          placeholder="Write a reply..."
                          maxLength={10000}
                          disabled={replyBusy}
                        />
                        <div className="flex justify-end">
                          <Button type="button" className="project-3d-btn-dark h-9 rounded-xl px-4" onClick={handleCreateReply} disabled={replyBusy || !replyDraft.trim()}>
                            <Send size={14} /> {replyBusy ? 'Posting…' : 'Reply'}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-5 rounded-xl border border-[#E7E1D8] bg-[#F7F5F1] px-4 py-3 text-[13px] text-[#6B665F]">You have view-only access to this project. Replies are not available for your role.</p>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmDeleteDiscussion}
        title="Delete discussion"
        description={`Delete "${discussion?.title || 'this discussion'}"? This action cannot be undone.`}
        confirmLabel="Delete"
        busyLabel="Deleting…"
        busy={actionBusy}
        error={actionError}
        onConfirm={handleDeleteDiscussionConfirmed}
        onClose={() => { if (!actionBusy) setConfirmDeleteDiscussion(false) }}
      />

      <ConfirmDialog
        open={Boolean(replyToDelete)}
        title="Delete reply"
        description="Delete this reply? Its position will remain as a deleted placeholder."
        confirmLabel="Delete"
        busyLabel="Deleting…"
        busy={actionBusy}
        error={actionError}
        onConfirm={handleDeleteReplyConfirmed}
        onClose={() => { if (!actionBusy) setReplyToDelete(null) }}
      />
    </>
  )
}
