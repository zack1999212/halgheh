import { useEffect, useState } from 'react'
import DialogShell from '@/components/shared/DialogShell'
import FormError from '@/components/shared/FormError'
import FormField from '@/components/shared/FormField'
import { useToast } from '@/components/shared/ToastProvider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useWorkspaceTheme } from '../workspace/hooks/useWorkspaceTheme.js'
import { createDiscussion } from './api.js'

/** Any workspace member can start a discussion; the caller becomes the author. */
export default function DiscussionCreateDialog({ open, workspaceId, onClose, onCreated }) {
  const { theme } = useWorkspaceTheme()
  const toast = useToast()
  const [type, setType] = useState('discussion')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setType('discussion')
    setTitle('')
    setContent('')
    setError('')
  }, [open])

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy || !workspaceId) return
    if (!title.trim() || !content.trim()) {
      setError('Add both a title and a message.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const created = await createDiscussion(workspaceId, {
        type,
        title: title.trim(),
        content: content.trim(),
      })
      toast.success('Discussion started')
      onCreated?.(created)
      onClose()
    } catch (err) {
      setError(err?.message || 'Could not start the discussion.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogShell
      open={open}
      title="Start a discussion"
      description="Share something with the workspace. Members can reply and react."
      onClose={() => !busy && onClose()}
      theme={theme}
      contentClassName="ws-dialog-scope"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="create-discussion-form" disabled={busy}>
            {busy ? 'Posting…' : 'Post discussion'}
          </Button>
        </>
      }
    >
      <form id="create-discussion-form" className="grid gap-4" onSubmit={handleSubmit}>
        <FormError>{error}</FormError>

        <FormField id="discussion-type" label="Type">
          {(props) => (
            <Select value={type} onValueChange={setType}>
              <SelectTrigger {...props}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="discussion">Discussion</SelectItem>
                <SelectItem value="announcement">Announcement</SelectItem>
              </SelectContent>
            </Select>
          )}
        </FormField>

        <FormField id="discussion-title" label="Title">
          {(props) => (
            <Input
              {...props}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="What is this about?"
              maxLength={255}
              autoFocus
            />
          )}
        </FormField>

        <FormField id="discussion-content" label="Message">
          {(props) => (
            <Textarea
              {...props}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Write your post…"
              rows={5}
              maxLength={10000}
            />
          )}
        </FormField>
      </form>
    </DialogShell>
  )
}
