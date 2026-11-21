import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { FieldMessage } from '@/components/shared/FormField'
import IconButton from '@/components/shared/IconButton'
import { formatDateTime } from './utils/taskFormat.js'

export default function TaskCommentsSection({
  comments,
  error,
  busy,
  currentUserId,
  onAdd,
  onDelete,
  canComment = true,
}) {
  const [draft, setDraft] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    const content = draft.trim()
    if (!content) return
    const ok = await onAdd(content)
    if (ok) setDraft('')
  }

  return (
    <section className="grid gap-3" aria-labelledby="task-comments-title">
      <h3 id="task-comments-title" className="text-[13px] font-semibold">Comments</h3>

      {comments.length === 0 ? (
        <p className="text-[12.5px] text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="grid gap-2">
          {comments.map((comment) => {
            const isAuthor = currentUserId != null && comment.user_id === currentUserId
            return (
              <li key={comment.id} className="rounded-[var(--radius-md)] border border-border bg-card px-3 py-2">
                <p className="whitespace-pre-wrap text-[13px] text-foreground">{comment.content}</p>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <div className="text-[11px] text-muted-foreground">
                    <span>{isAuthor ? 'You' : `User #${comment.user_id}`}</span>
                    {comment.created_at && <time dateTime={comment.created_at}> · {formatDateTime(comment.created_at)}</time>}
                  </div>
                  {isAuthor && (
                    <IconButton label="Delete comment" className="size-6 hover:text-destructive" onClick={() => onDelete(comment.id)} disabled={busy}>
                      <Trash2 size={12} aria-hidden="true" />
                    </IconButton>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <FieldMessage error={error} />

      {canComment ? (
        <form className="grid gap-2" onSubmit={handleSubmit}>
          <label htmlFor="task-comment-draft" className="sr-only">Add a comment</label>
          <Textarea
            id="task-comment-draft"
            className="min-h-[72px] rounded-[var(--radius-md)] px-3 py-2 text-base md:text-[15px]"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={4000}
            placeholder="Add a comment…"
            disabled={busy}
          />
          <div>
            <Button type="submit" variant="outline" size="sm" className="h-8" disabled={busy || !draft.trim()}>
              {busy ? 'Saving…' : 'Comment'}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-[12px] text-muted-foreground">View-only access. Comment actions are not available for your role.</p>
      )}
    </section>
  )
}
