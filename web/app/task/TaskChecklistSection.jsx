import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronUp, GripVertical, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useToast } from '@/components/ui/toast.jsx'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import LoadingState from '@/components/shared/LoadingState'
import ErrorState from '@/components/shared/ErrorState'
import {
  createChecklistItem,
  deleteChecklistItem,
  listChecklistItems,
  reorderChecklistItems,
  updateChecklistItem,
} from './api.js'

function normalizeItems(payload) {
  if (Array.isArray(payload?.items)) return payload.items
  if (Array.isArray(payload)) return payload
  return []
}

function reorderByIds(items, fromId, toId) {
  if (fromId === toId) return items
  const fromIdx = items.findIndex((i) => i.id === fromId)
  const toIdx = items.findIndex((i) => i.id === toId)
  if (fromIdx < 0 || toIdx < 0) return items
  const next = items.slice()
  const [moved] = next.splice(fromIdx, 1)
  next.splice(toIdx, 0, moved)
  return next
}

function makeDraftId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `draft-${crypto.randomUUID()}`
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export default function TaskChecklistSection({
  taskId,
  canEdit = false,
  onChanged,
  draftMode = false,
  draftItems = [],
  onDraftItemsChange,
}) {
  const { toast } = useToast()
  const isDraft = draftMode || !taskId
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [addBusy, setAddBusy] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [busyIds, setBusyIds] = useState({})
  const [collapsedCompleted, setCollapsedCompleted] = useState(false)
  const [draggingId, setDraggingId] = useState(null)
  const [dragOverId, setDragOverId] = useState(null)
  const [announce, setAnnounce] = useState('')
  const itemsRef = useRef([])
  const dragRef = useRef({ id: null, overId: null, pointerId: null })
  const dragCleanupRef = useRef(null)
  const listRef = useRef(null)
  const onChangedRef = useRef(onChanged)
  const onDraftItemsChangeRef = useRef(onDraftItemsChange)

  const currentItems = isDraft ? (Array.isArray(draftItems) ? draftItems : []) : items

  useEffect(() => { onChangedRef.current = onChanged }, [onChanged])
  useEffect(() => { onDraftItemsChangeRef.current = onDraftItemsChange }, [onDraftItemsChange])
  useEffect(() => { itemsRef.current = currentItems }, [currentItems])
  useEffect(() => () => { dragCleanupRef.current?.() }, [])

  const setItemsState = useCallback((updater) => {
    if (isDraft) {
      const prev = Array.isArray(draftItems) ? draftItems : []
      const next = typeof updater === 'function' ? updater(prev) : updater
      onDraftItemsChangeRef.current?.(next)
      return
    }
    setItems((prev) => (typeof updater === 'function' ? updater(prev) : updater))
  }, [isDraft, draftItems])

  const load = useCallback(async (signal) => {
    if (!taskId || isDraft) return
    setLoading(true)
    setError('')
    try {
      const payload = await listChecklistItems(taskId, { signal })
      if (signal?.aborted) return
      setItems(normalizeItems(payload))
    } catch (err) {
      if (signal?.aborted || err?.status === 0) return
      setError(err?.message || 'Could not load checklist.')
      setItems([])
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [taskId, isDraft])

  useEffect(() => {
    if (isDraft) return
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load, isDraft])

  const setItemBusy = useCallback((id, value) => {
    setBusyIds((prev) => (value ? { ...prev, [id]: true } : (() => { const n = { ...prev }; delete n[id]; return n })()))
  }, [])

  const completedItems = useMemo(() => currentItems.filter((i) => i.is_completed), [currentItems])
  const visibleItems = useMemo(() => (collapsedCompleted ? currentItems.filter((i) => !i.is_completed) : currentItems), [currentItems, collapsedCompleted])
  const completedCount = completedItems.length
  const totalCount = currentItems.length
  const progressPct = totalCount ? Math.round((completedCount / totalCount) * 100) : 0

  const notifyChanged = useCallback(() => {
    onChangedRef.current?.()
  }, [])

  async function handleAdd(e) {
    e?.preventDefault?.()
    const title = newTitle.trim()
    if (!title || addBusy || !canEdit) return
    if (isDraft) {
      const item = { id: makeDraftId(), title, is_completed: false }
      setItemsState((prev) => [...prev, item])
      setNewTitle('')
      return
    }
    setAddBusy(true)
    try {
      const created = await createChecklistItem(taskId, { title })
      setItems((prev) => [...prev, created])
      setNewTitle('')
      notifyChanged()
    } catch (err) {
      toast({ tone: 'error', title: 'Checklist item not added', message: err?.message || 'Could not create checklist item.' })
    } finally {
      setAddBusy(false)
    }
  }

  async function handleToggle(item, checked) {
    if (!canEdit || busyIds[item.id]) return
    const nextVal = Boolean(checked)
    if (isDraft) {
      setItemsState((cur) => cur.map((i) => (i.id === item.id ? { ...i, is_completed: nextVal } : i)))
      return
    }
    const prev = items
    setItems((cur) => cur.map((i) => (i.id === item.id ? { ...i, is_completed: nextVal } : i)))
    setItemBusy(item.id, true)
    try {
      const updated = await updateChecklistItem(taskId, item.id, { is_completed: nextVal })
      setItems((cur) => cur.map((i) => (i.id === item.id ? { ...i, ...updated } : i)))
      notifyChanged()
    } catch (err) {
      setItems(prev)
      toast({ tone: 'error', title: 'Checklist update failed', message: err?.message || 'Could not update checklist item.' })
    } finally {
      setItemBusy(item.id, false)
    }
  }

  function startEdit(item) {
    if (!canEdit) return
    setEditingId(item.id)
    setEditTitle(item.title || '')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditTitle('')
  }

  async function saveEdit(item) {
    if (!canEdit || busyIds[item.id]) return
    const title = editTitle.trim()
    if (!title) {
      toast({ tone: 'error', title: 'Title required', message: 'Checklist item title cannot be empty.' })
      return
    }
    if (title === item.title) {
      cancelEdit()
      return
    }
    if (isDraft) {
      setItemsState((cur) => cur.map((i) => (i.id === item.id ? { ...i, title } : i)))
      cancelEdit()
      return
    }
    setItemBusy(item.id, true)
    try {
      const updated = await updateChecklistItem(taskId, item.id, { title })
      setItems((cur) => cur.map((i) => (i.id === item.id ? { ...i, ...updated } : i)))
      cancelEdit()
      notifyChanged()
    } catch (err) {
      toast({ tone: 'error', title: 'Checklist update failed', message: err?.message || 'Could not update checklist item.' })
    } finally {
      setItemBusy(item.id, false)
    }
  }

  async function handleDelete(item) {
    if (!canEdit || busyIds[item.id]) return
    if (isDraft) {
      setItemsState((cur) => cur.filter((i) => i.id !== item.id))
      return
    }
    const prev = items
    setItems((cur) => cur.filter((i) => i.id !== item.id))
    setItemBusy(item.id, true)
    try {
      await deleteChecklistItem(taskId, item.id)
      notifyChanged()
    } catch (err) {
      setItems(prev)
      toast({ tone: 'error', title: 'Checklist item not deleted', message: err?.message || 'Could not delete checklist item.' })
    } finally {
      setItemBusy(item.id, false)
    }
  }

  const commitReorder = useCallback(async (nextItems, movedId) => {
    if (isDraft) {
      setItemsState(nextItems)
      const idx = nextItems.findIndex((i) => i.id === movedId)
      if (idx >= 0) setAnnounce(`Moved checklist item to position ${idx + 1} of ${nextItems.length}.`)
      return
    }
    const prev = itemsRef.current
    setItems(nextItems)
    try {
      const payload = await reorderChecklistItems(taskId, { item_ids: nextItems.map((i) => i.id) })
      const serverItems = normalizeItems(payload)
      if (serverItems.length) setItems(serverItems)
      const idx = nextItems.findIndex((i) => i.id === movedId)
      if (idx >= 0) setAnnounce(`Moved checklist item to position ${idx + 1} of ${nextItems.length}.`)
      notifyChanged()
    } catch (err) {
      setItems(prev)
      toast({ tone: 'error', title: 'Reorder failed', message: err?.message || 'Could not reorder checklist items.' })
    }
  }, [isDraft, taskId, notifyChanged, toast, setItemsState])

  function moveByKeyboard(itemId, direction) {
    if (!canEdit) return
    const ordered = itemsRef.current
    const idx = ordered.findIndex((i) => i.id === itemId)
    const target = idx + direction
    if (idx < 0 || target < 0 || target >= ordered.length) return
    const next = ordered.slice()
    const [moved] = next.splice(idx, 1)
    next.splice(target, 0, moved)
    commitReorder(next, itemId)
  }

  function onHandlePointerDown(e, itemId) {
    if (!canEdit) return
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = { id: itemId, overId: itemId, pointerId: e.pointerId }
    setDraggingId(itemId)
    setDragOverId(itemId)
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}

    const onMove = (ev) => {
      if (dragRef.current.id !== itemId) return
      const el = document.elementFromPoint(ev.clientX, ev.clientY)
      const row = el?.closest?.('[data-checklist-id]')
      const overId = row ? Number(row.getAttribute('data-checklist-id')) : null
      if (overId && overId !== dragRef.current.overId) {
        dragRef.current.overId = overId
        setDragOverId(overId)
      }
    }

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      if (dragCleanupRef.current === cleanup) dragCleanupRef.current = null
    }
    const onUp = async () => {
      cleanup()
      const { id, overId } = dragRef.current
      dragRef.current = { id: null, overId: null, pointerId: null }
      setDraggingId(null)
      setDragOverId(null)
      if (!id || !overId || id === overId) return
      const next = reorderByIds(itemsRef.current, id, overId)
      if (next !== itemsRef.current) await commitReorder(next, id)
    }

    dragCleanupRef.current = cleanup
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  return (
    <section className="grid gap-3" aria-labelledby="task-checklist-title">
      <div className="flex items-center justify-between gap-2">
        <div className="grid gap-1">
          <h3 id="task-checklist-title" className="text-[13px] font-semibold text-foreground">Checklist</h3>
          {totalCount > 0 ? (
            <p className="text-[12px] text-muted-foreground">
              {completedCount} / {totalCount} completed — {progressPct}%
            </p>
          ) : null}
        </div>
        {totalCount > 0 ? (
          <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {progressPct}%
          </span>
        ) : null}
      </div>

      {totalCount > 0 ? (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progressPct}%` }} />
        </div>
      ) : null}

      {loading ? <LoadingState label="Loading checklist…" /> : null}
      {!loading && error ? <ErrorState title="Could not load checklist" message={error} onRetry={() => load()} /> : null}

      {!loading && !error ? (
        <>
          <div
            ref={listRef}
            className={`tasks-checklist ${draggingId ? 'tasks-checklist--dragging' : ''}`}
            role="list"
            aria-label="Task checklist"
          >
            {visibleItems.map((item, visibleIdx) => {
              const isBusy = Boolean(busyIds[item.id])
              const isEditing = editingId === item.id
              const isDragging = draggingId === item.id
              const isOver = dragOverId === item.id && draggingId && draggingId !== item.id
              const actualIdx = currentItems.findIndex((i) => i.id === item.id)
              return (
                <div
                  key={item.id}
                  data-checklist-id={item.id}
                  role="listitem"
                  className={`tasks-checklist-item ${isDragging ? 'is-dragging' : ''} ${isOver ? 'is-over' : ''}`}
                >
                  {canEdit ? (
                    <button
                      type="button"
                      className="tasks-checklist-handle"
                      aria-label={`Drag to reorder ${item.title}`}
                      onPointerDown={(e) => onHandlePointerDown(e, item.id)}
                      disabled={isBusy || isEditing}
                    >
                      <GripVertical size={14} aria-hidden="true" />
                    </button>
                  ) : null}

                  <Checkbox
                    checked={Boolean(item.is_completed)}
                    onCheckedChange={(checked) => handleToggle(item, checked)}
                    disabled={!canEdit || isBusy || isEditing}
                    aria-label={`Mark ${item.title} as ${item.is_completed ? 'incomplete' : 'complete'}`}
                  />

                  <div className="tasks-checklist-content">
                    {isEditing ? (
                      <div className="tasks-checklist-edit">
                        <Input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          maxLength={200}
                          aria-label="Edit checklist item title"
                          disabled={isBusy}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              e.stopPropagation()
                              saveEdit(item)
                            }
                            if (e.key === 'Escape') {
                              e.preventDefault()
                              e.stopPropagation()
                              cancelEdit()
                            }
                          }}
                        />
                        <Button type="button" size="sm" className="h-8 px-2" disabled={isBusy} onClick={() => saveEdit(item)}>Save</Button>
                        <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={cancelEdit} disabled={isBusy}>
                          <X size={14} aria-hidden="true" />
                        </Button>
                      </div>
                    ) : (
                      <span className={`tasks-checklist-title ${item.is_completed ? 'is-completed' : ''}`}>
                        {item.title}
                      </span>
                    )}
                  </div>

                  {canEdit && !isEditing ? (
                    <div className="tasks-checklist-actions">
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={`Move ${item.title} up`} onClick={() => moveByKeyboard(item.id, -1)} disabled={isBusy || actualIdx <= 0}>
                        <ChevronUp size={14} aria-hidden="true" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={`Move ${item.title} down`} onClick={() => moveByKeyboard(item.id, 1)} disabled={isBusy || actualIdx >= currentItems.length - 1}>
                        <ChevronDown size={14} aria-hidden="true" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={`Edit ${item.title}`} onClick={() => startEdit(item)} disabled={isBusy}>
                        <Pencil size={14} aria-hidden="true" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" aria-label={`Delete ${item.title}`} onClick={() => handleDelete(item)} disabled={isBusy}>
                        <Trash2 size={14} aria-hidden="true" />
                      </Button>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>

          {totalCount === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[13px] text-muted-foreground">
              No checklist items yet.
            </p>
          ) : null}

          {completedCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-start px-1 text-muted-foreground"
              onClick={() => setCollapsedCompleted((v) => !v)}
              aria-expanded={!collapsedCompleted}
              aria-controls="task-checklist-title"
            >
              {collapsedCompleted ? `Show ${completedCount} completed item${completedCount === 1 ? '' : 's'}` : `Hide completed (${completedCount})`}
            </Button>
          ) : null}

          {canEdit ? (
            <div className="tasks-checklist-add">
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Add a checklist item…"
                maxLength={200}
                aria-label="New checklist item title"
                disabled={addBusy}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    e.stopPropagation()
                    handleAdd(e)
                  }
                }}
              />
              <Button type="button" size="sm" className="h-9 gap-1.5" disabled={addBusy || !newTitle.trim()} onClick={handleAdd}>
                <Plus size={14} aria-hidden="true" /> Add
              </Button>
            </div>
          ) : null}
        </>
      ) : null}

      <div className="sr-only" aria-live="polite">{announce}</div>
    </section>
  )
}
