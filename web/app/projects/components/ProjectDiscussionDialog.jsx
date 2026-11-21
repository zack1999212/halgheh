import { useEffect, useState } from 'react'
import DialogShell from '@/components/shared/DialogShell'
import FormError from '@/components/shared/FormError'
import FormField from '@/components/shared/FormField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

const TYPE_OPTIONS = [
  { value: 'discussion', label: 'Discussion' },
  { value: 'announcement', label: 'Announcement' },
]

export default function ProjectDiscussionDialog({
  open,
  mode = 'create',
  discussion = null,
  canCreateAnnouncement = false,
  busy = false,
  error = '',
  onClose,
  onSubmit,
}) {
  const isEdit = mode === 'edit'
  const [type, setType] = useState('discussion')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')

  useEffect(() => {
    if (!open) return
    setType(isEdit ? (discussion?.type || 'discussion') : 'discussion')
    setTitle(isEdit ? (discussion?.title || '') : '')
    setContent(isEdit ? (discussion?.content || '') : '')
  }, [open, isEdit, discussion])

  const titleTrimmed = title.trim()
  const contentTrimmed = content.trim()
  const hasChanges = !isEdit
    || titleTrimmed !== (discussion?.title || '')
    || contentTrimmed !== (discussion?.content || '')
  const canSubmit = titleTrimmed.length > 0 && contentTrimmed.length > 0 && hasChanges && !busy

  const allowedTypeOptions = TYPE_OPTIONS.filter(
    (opt) => opt.value !== 'announcement' || canCreateAnnouncement || type === 'announcement',
  )

  function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    if (isEdit) {
      const payload = {}
      if (titleTrimmed !== (discussion?.title || '')) payload.title = titleTrimmed
      if (contentTrimmed !== (discussion?.content || '')) payload.content = contentTrimmed
      if (Object.keys(payload).length === 0) return
      onSubmit(payload)
      return
    }
    onSubmit({ type, title: titleTrimmed, content: contentTrimmed })
  }

  const fieldClass = 'h-11 rounded-xl border-[#E7E1D8] bg-white px-3 text-[14px] text-[#191919] shadow-[inset_0_1px_2px_rgba(25,25,25,0.02)] focus-visible:ring-[#FFC400]/30'

  return (
    <DialogShell
      open={open}
      title={isEdit ? 'Edit discussion' : 'New post'}
      description={isEdit ? 'Update the discussion title or content.' : 'Share an announcement or start a discussion with your project team.'}
      onClose={busy ? () => {} : onClose}
      wide
      contentClassName="border-[#E7E1D8] bg-white shadow-[0_20px_60px_rgba(25,25,25,0.12)]"
      footer={(
        <>
          <Button type="button" variant="outline" className="h-10 rounded-xl border-[#E7E1D8] bg-white px-4 text-[#5F5A51] hover:bg-[#F7F5F1] hover:text-[#191919]" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" form="project-discussion-form" className="h-10 rounded-xl bg-[#191919] px-4 text-white hover:bg-[#2A2A2A]" disabled={!canSubmit}>
            {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Post'}
          </Button>
        </>
      )}
    >
      <form id="project-discussion-form" className="grid gap-5" onSubmit={handleSubmit}>
        <FormError>{error}</FormError>

        {!isEdit && (
          <FormField label="Type">
            {(fieldProps) => (
              <Select value={type} onValueChange={setType} disabled={busy}>
                <SelectTrigger {...fieldProps} className={fieldClass}>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-[#E7E1D8]">
                  {allowedTypeOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <span className="flex items-center gap-2">
                        {opt.label}
                        {opt.value === 'announcement' && <span className="rounded-full bg-[#FFC400] px-1.5 py-0.5 text-[10px] font-semibold text-[#191919]">Admin</span>}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        )}

        <FormField label="Title">
          {(fieldProps) => (
            <Input
              {...fieldProps}
              className={fieldClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={type === 'announcement' ? 'Announcement title' : 'Discussion title'}
              maxLength={255}
              disabled={busy}
            />
          )}
        </FormField>

        <FormField label="Content" hint="Write clearly. You can use line breaks for readable formatting.">
          {(fieldProps) => (
            <Textarea
              {...fieldProps}
              className={cn('min-h-[180px] rounded-xl border-[#E7E1D8] bg-white px-3 py-3 text-[14px] leading-relaxed text-[#191919] shadow-[inset_0_1px_2px_rgba(25,25,25,0.02)] focus-visible:ring-[#FFC400]/30', busy && 'opacity-60')}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Share details, context, or updates with the project team..."
              maxLength={10000}
              disabled={busy}
            />
          )}
        </FormField>
      </form>
    </DialogShell>
  )
}
