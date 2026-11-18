import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

/**
 * Tags of the open document. Attaching uses the workspace tag catalog
 * (POST /documents/{id}/tags?tag_id=…), detaching removes the association;
 * the catalog itself is extended through the create-tag dialog.
 */
export default function TagsSection({ document, tags, onAttach, onDetach, onCreateTag }) {
  const [showCreate, setShowCreate] = useState(false)
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const attachedIds = new Set((document.tags || []).map((tag) => tag.id))
  const available = (tags.data || []).filter((tag) => !attachedIds.has(tag.id))

  async function handleAttach(tagId) {
    setActionBusy(true)
    setActionError('')
    try {
      await onAttach(tagId)
    } catch (caught) {
      setActionError(caught?.message || 'Could not attach the tag.')
    } finally {
      setActionBusy(false)
    }
  }

  async function handleDetach(tagId) {
    setActionBusy(true)
    setActionError('')
    try {
      await onDetach(tagId)
    } catch (caught) {
      setActionError(caught?.message || 'Could not remove the tag.')
    } finally {
      setActionBusy(false)
    }
  }

  async function handleCreateTag(payload) {
    setCreateBusy(true)
    setCreateError('')
    try {
      await onCreateTag(payload)
      setShowCreate(false)
    } catch (caught) {
      setCreateError(caught?.message || 'Could not create the tag.')
    } finally {
      setCreateBusy(false)
    }
  }

  return (
    <div className="grid gap-2">
      {document.tags?.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {document.tags.map((tag) => (
            <li
              key={tag.id}
              className="flex items-center gap-1.5 rounded-full border border-border bg-card py-0.5 pl-2 pr-0.5 text-[12px]"
            >
              <TagDot color={tag.color} />
              <span>{tag.name}</span>
              <IconButton
                label={`Remove tag ${tag.name}`}
                className="size-5 rounded-full"
                disabled={actionBusy}
                onClick={() => handleDetach(tag.id)}
              >
                <span aria-hidden="true" className="text-[13px] leading-none">
                  ×
                </span>
              </IconButton>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-muted-foreground">No tags attached.</p>
      )}

      {actionError && (
        <p role="alert" className="text-[12px] text-destructive">
          {actionError}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Select
          value=""
          onValueChange={(value) => {
            if (value === '__create__') {
              setCreateError('')
              setShowCreate(true)
            } else {
              handleAttach(Number(value))
            }
          }}
          disabled={actionBusy || (!available.length && !(tags.data || []).length)}
        >
          <SelectTrigger
            aria-label="Attach a tag"
            className="h-8 flex-1 text-[12.5px]"
          >
            <Plus size={13} aria-hidden="true" className="text-muted-foreground" />
            <SelectValue
              placeholder={
                available.length ? 'Attach tag…' : 'No available tags to attach'
              }
            />
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
            <SelectItem value="__create__">Create new tag…</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 px-2 text-[12.5px] text-muted-foreground"
          onClick={() => {
            setCreateError('')
            setShowCreate(true)
          }}
          disabled={actionBusy}
        >
          New tag
        </Button>
      </div>

      <TagCreateDialog
        open={showCreate}
        busy={createBusy}
        error={createError}
        onClose={() => {
          if (!createBusy) {
            setShowCreate(false)
          }
        }}
        onCreate={handleCreateTag}
      />
    </div>
  )
}
