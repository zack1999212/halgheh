import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import ConfirmDialog from '@/components/shared/ConfirmDialog.jsx'
import DialogShell from '@/components/shared/DialogShell.jsx'
import FormError from '@/components/shared/FormError.jsx'
import FormField, { fieldInputClass } from '@/components/shared/FormField.jsx'
import IconButton from '@/components/shared/IconButton.jsx'
import TagCreateDialog from '../tags/TagCreateDialog.jsx'

/** Small colored dot for a tag's data-driven hex color. */
export function TagDot({ color }) {
  return (
    <span
      aria-hidden="true"
      className="size-2.5 shrink-0 rounded-full border border-black/10"
      style={{ backgroundColor: color }}
    />
  )
}

function TagEditDialog({ tag, open, busy, error, onClose, onSave }) {
  const [name, setName] = useState(tag?.name ?? '')
  const [color, setColor] = useState(tag?.color ?? '#2563eb')

  useEffect(() => {
    if (open && tag) {
      setName(tag.name ?? '')
      setColor(tag.color ?? '#2563eb')
    }
  }, [open, tag?.id, tag?.name, tag?.color])

  const trimmed = name.trim()
  const unchanged =
    trimmed === (tag?.name ?? '') && color === (tag?.color ?? '#2563eb')

  return (
    <DialogShell
      open={open}
      title="Edit tag"
      description="Rename the tag or change its color. Changes apply across the workspace."
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!trimmed || unchanged || busy}
            onClick={() => onSave({ name: trimmed, color })}
          >
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <FormField label="Name" htmlFor="edit-tag-name">
          <Input
            id="edit-tag-name"
            className={fieldInputClass}
            value={name}
            maxLength={64}
            onChange={(event) => setName(event.target.value)}
            disabled={busy}
          />
        </FormField>
        <FormField label="Color" htmlFor="edit-tag-color">
          <div className="flex items-center gap-3">
            <Input
              id="edit-tag-color"
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              disabled={busy}
              className="h-9 w-14 cursor-pointer p-1"
              aria-label="Tag color"
            />
            <span className="text-[12px] text-muted-foreground">{color}</span>
          </div>
        </FormField>
        <FormError message={error} />
      </div>
    </DialogShell>
  )
}

/**
 * Tags of the open document. Attaching uses the workspace tag catalog
 * (POST /documents/{id}/tags?tag_id=…), detaching removes the association;
 * the catalog itself is extended through the create-tag dialog.
 */
export default function TagsSection({
  document,
  tags,
  onAttach,
  onDetach,
  onCreateTag,
  onUpdateTag,
  onDeleteTag,
}) {
  const [showCreate, setShowCreate] = useState(false)
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState('')
  const [showManage, setShowManage] = useState(false)
  const [editingTag, setEditingTag] = useState(null)
  const [editBusy, setEditBusy] = useState(false)
  const [editError, setEditError] = useState('')
  const [deletingTag, setDeletingTag] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const attached = document.tags || []
  const attachedIds = new Set(attached.map((tag) => tag.id))
  const available = (tags.data || []).filter((tag) => !attachedIds.has(tag.id))

  async function handleCreate(payload) {
    setCreateBusy(true)
    setCreateError('')
    try {
      const created = await onCreateTag(payload)
      await onAttach(created.id)
      setShowCreate(false)
    } catch (caught) {
      setCreateError(caught?.message || 'The tag could not be created.')
    } finally {
      setCreateBusy(false)
    }
  }

  async function handleEdit(payload) {
    if (!editingTag || !onUpdateTag) return
    setEditBusy(true)
    setEditError('')
    try {
      await onUpdateTag(editingTag.id, payload)
      setEditingTag(null)
    } catch (caught) {
      setEditError(caught?.message || 'The tag could not be updated.')
    } finally {
      setEditBusy(false)
    }
  }

  async function handleDelete() {
    if (!deletingTag || !onDeleteTag) return
    setDeleteBusy(true)
    setDeleteError('')
    try {
      await onDeleteTag(deletingTag.id)
      setDeletingTag(null)
    } catch (caught) {
      setDeleteError(caught?.message || 'The tag could not be deleted.')
    } finally {
      setDeleteBusy(false)
    }
  }

  const canManage = typeof onUpdateTag === 'function' && typeof onDeleteTag === 'function'

  return (
    <div className="grid gap-2">
      {attached.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Attached tags">
          {attached.map((tag) => (
            <li
              key={tag.id}
              className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-[12px]"
            >
              <TagDot color={tag.color} />
              <span className="max-w-[140px] truncate">{tag.name}</span>
              <IconButton
                label={`Remove tag ${tag.name}`}
                size="sm"
                className="size-5"
                onClick={() => onDetach(tag.id)}
              >
                <span aria-hidden="true" className="text-[13px] leading-none">
                  ×
                </span>
              </IconButton>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12.5px] text-muted-foreground">No tags attached.</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {available.length > 0 && (
          <Select
            value=""
            onValueChange={(value) => onAttach(Number(value))}
            disabled={tags.status === 'loading'}
          >
            <SelectTrigger
              aria-label="Add existing tag"
              className="h-8 w-[170px] text-[12px]"
            >
              <SelectValue placeholder="Add tag…" />
            </SelectTrigger>
            <SelectContent>
              {available.map((tag) => (
                <SelectItem key={tag.id} value={String(tag.id)}>
                  <span className="flex items-center gap-2">
                    <TagDot color={tag.color} />
                    {tag.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-[12px]"
          onClick={() => setShowCreate(true)}
        >
          <Plus size={13} aria-hidden="true" />
          New tag
        </Button>
        {canManage && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-[12px]"
            onClick={() => {
              setEditError('')
              setDeleteError('')
              setShowManage(true)
            }}
          >
            Manage
          </Button>
        )}
      </div>

      <TagCreateDialog
        open={showCreate}
        busy={createBusy}
        error={createError}
        onClose={() => {
          setCreateError('')
          setShowCreate(false)
        }}
        onCreate={handleCreate}
      />

      <DialogShell
        open={showManage}
        title="Manage tags"
        description="Rename or delete workspace tags. Deleting a tag removes it from all documents."
        onClose={() => setShowManage(false)}
        footer={
          <Button type="button" variant="ghost" onClick={() => setShowManage(false)}>
            Close
          </Button>
        }
      >
        {tags.status === 'error' ? (
          <p className="text-[13px] text-destructive">
            {tags.error?.message || 'Tags could not be loaded.'}
          </p>
        ) : (tags.data || []).length ? (
          <ul className="grid gap-2">
            {(tags.data || []).map((tag) => (
              <li
                key={tag.id}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
              >
                <TagDot color={tag.color} />
                <span className="min-w-0 flex-1 truncate text-[13px]">{tag.name}</span>
                <IconButton
                  label={`Rename tag ${tag.name}`}
                  onClick={() => {
                    setEditError('')
                    setEditingTag(tag)
                  }}
                >
                  <Pencil size={14} aria-hidden="true" />
                </IconButton>
                <IconButton
                  label={`Delete tag ${tag.name}`}
                  onClick={() => {
                    setDeleteError('')
                    setDeletingTag(tag)
                  }}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </IconButton>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted-foreground">No tags in this workspace yet.</p>
        )}
      </DialogShell>

      <TagEditDialog
        tag={editingTag}
        open={Boolean(editingTag)}
        busy={editBusy}
        error={editError}
        onClose={() => {
          setEditError('')
          setEditingTag(null)
        }}
        onSave={handleEdit}
      />

      <ConfirmDialog
        open={Boolean(deletingTag)}
        title="Delete tag?"
        description={
          deletingTag
            ? `"${deletingTag.name}" will be removed from this workspace and detached from all documents.`
            : ''
        }
        confirmLabel="Delete tag"
        busy={deleteBusy}
        busyLabel="Deleting…"
        error={deleteError}
        onConfirm={handleDelete}
        onClose={() => {
          if (deleteBusy) return
          setDeleteError('')
          setDeletingTag(null)
        }}
      />
    </div>
  )
}
