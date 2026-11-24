import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Inbox } from 'lucide-react'
import LoadingState from '@/components/shared/LoadingState'
import ErrorState from '@/components/shared/ErrorState'
import EmptyState from '@/components/shared/EmptyState'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import TaskCard from './TaskCard.jsx'
import { TASK_PRIORITIES, TASK_STATUSES } from './utils/taskConstants.js'

function sortColumnItems(items, positionField) {
  return [...items].sort((a, b) => (a[positionField] ?? 0) - (b[positionField] ?? 0) || a.id - b.id)
}

export default function TaskBoardView({
  items,
  loading,
  error,
  onRetry,
  boardMode = 'status',
  onStatusChange,
  onPriorityChange,
  onDelete,
  onMoveTask,
  onOpen,
  isStatusPending,
}) {
  const isPriorityMode = boardMode === 'priority'
  const columnsDef = isPriorityMode ? TASK_PRIORITIES : TASK_STATUSES
  const columnField = isPriorityMode ? 'priority' : 'status'
  const positionField = isPriorityMode ? 'priority_position' : 'position'
  const targetKey = isPriorityMode ? 'target_priority' : 'target_status'
  const [drag, setDrag] = useState(null) // { taskId, fromStatus, overColumnId, insertIndex }
  const dragRef = useRef(null)
  const pointerIdRef = useRef(null)
  const cardRectsRef = useRef(new Map())
  const suppressClickRef = useRef(false)

  const columns = useMemo(() => {
    const byColumn = new Map(columnsDef.map((col) => [col.id, []]))
    for (const item of items) {
      const key = item[columnField]
      if (byColumn.has(key)) byColumn.get(key).push(item)
    }
    for (const [key, list] of byColumn.entries()) {
      byColumn.set(key, sortColumnItems(list, positionField))
    }
    return byColumn
  }, [items, columnsDef, columnField, positionField])

  const findTask = useCallback((taskId) => items.find((item) => item.id === taskId) || null, [items])

  const getInsertIndex = useCallback((columnId, clientY) => {
    const rects = cardRectsRef.current.get(columnId) || []
    if (!rects.length) return 0
    for (let i = 0; i < rects.length; i += 1) {
      const { mid } = rects[i]
      if (clientY < mid) return i
    }
    return rects.length
  }, [])

  const cleanupDrag = useCallback(() => {
    dragRef.current = null
    pointerIdRef.current = null
    setDrag(null)
  }, [])

  const finishDrag = useCallback((clientX, clientY) => {
    const current = dragRef.current
    cleanupDrag()
    if (!current) return
    const el = document.elementFromPoint(clientX, clientY)
    const columnEl = el?.closest?.('[data-task-column]')
    const overColumnId = columnEl?.getAttribute('data-task-column') || current.overColumnId
    if (!overColumnId) return

    const task = findTask(current.taskId)
    if (!task) return
    const columnItems = (columns.get(overColumnId) || []).filter((item) => item.id !== task.id)
    let insertIndex = current.insertIndex
    if (columnEl) insertIndex = getInsertIndex(overColumnId, clientY)
    insertIndex = Math.max(0, Math.min(insertIndex, columnItems.length))

    const beforeTask = columnItems[insertIndex - 1] || null
    const afterTask = columnItems[insertIndex] || null

    // No-op if dropped in same place.
    if (task[columnField] === overColumnId) {
      const originalColumn = columns.get(overColumnId) || []
      const oldIndex = originalColumn.findIndex((item) => item.id === task.id)
      const prevBefore = originalColumn[oldIndex - 1]?.id ?? null
      const prevAfter = originalColumn[oldIndex + 1]?.id ?? null
      if ((beforeTask?.id ?? null) === prevBefore && (afterTask?.id ?? null) === prevAfter) return
    }

    const payload = {
      [targetKey]: overColumnId,
      before_task_id: beforeTask?.id ?? null,
      after_task_id: afterTask?.id ?? null,
    }

    suppressClickRef.current = true
    window.setTimeout(() => { suppressClickRef.current = false }, 250)

    if (typeof onMoveTask === 'function') {
      onMoveTask(task, payload)
    } else if (!isPriorityMode && task.status !== overColumnId) {
      onStatusChange?.(task, overColumnId)
    }
  }, [cleanupDrag, columns, findTask, getInsertIndex, onMoveTask, onStatusChange, columnField, targetKey, isPriorityMode])

  const pendingRef = useRef(null)

  // Stable window listeners: always delegate to latest refs so add/remove uses
  // the same function identity across re-renders (avoids zombie listeners).
  const handlePointerMoveRef = useRef(() => {})
  const handlePointerUpRef = useRef(() => {})
  const stablePointerMove = useRef((e) => handlePointerMoveRef.current(e))
  const stablePointerUp = useRef((e) => handlePointerUpRef.current(e))

  const removeWindowListeners = useCallback(() => {
    window.removeEventListener('pointermove', stablePointerMove.current)
    window.removeEventListener('pointerup', stablePointerUp.current)
    window.removeEventListener('pointercancel', stablePointerUp.current)
  }, [])

  const handlePointerMove = useCallback((event) => {
    const pending = pendingRef.current
    if (pending && pointerIdRef.current === event.pointerId) {
      const dx = event.clientX - pending.startX
      const dy = event.clientY - pending.startY
      if (Math.hypot(dx, dy) < 8) return
      const state = pending.state
      dragRef.current = state
      setDrag(state)
      pendingRef.current = null
      try { pending.cardEl?.setPointerCapture?.(event.pointerId) } catch {}
    }
    const current = dragRef.current
    if (!current || pointerIdRef.current !== event.pointerId) return
    event.preventDefault()
    const el = document.elementFromPoint(event.clientX, event.clientY)
    const columnEl = el?.closest?.('[data-task-column]')
    const overColumnId = columnEl?.getAttribute('data-task-column') || current.overColumnId
    const insertIndex = getInsertIndex(overColumnId, event.clientY)
    const next = { ...current, overColumnId, insertIndex }
    dragRef.current = next
    setDrag(next)
  }, [getInsertIndex])

  const handlePointerUp = useCallback((event) => {
    if (pointerIdRef.current !== event.pointerId) return
    const pending = pendingRef.current
    if (pending) {
      pendingRef.current = null
      pointerIdRef.current = null
      removeWindowListeners()
      return
    }
    event.preventDefault()
    removeWindowListeners()
    finishDrag(event.clientX, event.clientY)
  }, [finishDrag, removeWindowListeners])

  handlePointerMoveRef.current = handlePointerMove
  handlePointerUpRef.current = handlePointerUp

  const startDrag = useCallback((task, event) => {
    if (!task?.id) return
    if (typeof isStatusPending === 'function' && isStatusPending(task.id)) return
    if (event.button != null && event.button !== 0) return
    const interactive = event.target?.closest?.('button, a, input, select, textarea, [role="menuitem"], [data-no-card-drag="true"]')
    if (interactive) return

    // Clean up any stale listeners from a previous interrupted drag.
    removeWindowListeners()

    const cardEl = event.currentTarget
    const rect = cardEl?.getBoundingClientRect?.()
    const state = {
      taskId: task.id,
      fromStatus: task.status,
      overColumnId: task.status,
      insertIndex: (columns.get(task.status) || []).findIndex((item) => item.id === task.id),
      offsetX: rect ? event.clientX - rect.left : 0,
      offsetY: rect ? event.clientY - rect.top : 0,
    }
    pointerIdRef.current = event.pointerId
    pendingRef.current = { startX: event.clientX, startY: event.clientY, state, cardEl }
    window.addEventListener('pointermove', stablePointerMove.current, { passive: false })
    window.addEventListener('pointerup', stablePointerUp.current, { passive: false })
    window.addEventListener('pointercancel', stablePointerUp.current, { passive: false })
  }, [columns, isStatusPending, removeWindowListeners])

  useEffect(() => () => {
    window.removeEventListener('pointermove', stablePointerMove.current)
    window.removeEventListener('pointerup', stablePointerUp.current)
    window.removeEventListener('pointercancel', stablePointerUp.current)
  }, [])

  const handleOpen = useCallback((id) => {
    if (suppressClickRef.current) return
    onOpen?.(id)
  }, [onOpen])


  if (loading) {
    return <div className="p-2"><LoadingState label="Loading tasks…" /></div>
  }
  if (error) {
    return <ErrorState title="Could not load tasks" message={error} onRetry={onRetry} />
  }
  if (!items.length) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        className="py-10"
      />
    )
  }

  return (
    <div className={cn('tasks-board', drag && 'tasks-board--dragging')} aria-label="Task board">
      {columnsDef.map((column) => {
        const columnItems = columns.get(column.id) || []
        const isOver = drag?.overColumnId === column.id
        const visibleItems = drag ? columnItems.filter((item) => item.id !== drag.taskId) : columnItems
        const insertIndex = isOver ? Math.max(0, Math.min(drag.insertIndex, visibleItems.length)) : -1

        return (
          <section
            key={column.id}
            data-task-column={column.id}
            className={cn('tasks-board-column', isOver && 'tasks-board-column--over')}
            aria-label={`${column.label} column`}
          >
            <div className="tasks-board-column-header">
              <h3 className="min-w-0 truncate text-[13px] font-semibold tracking-[-0.01em] text-foreground">
                {column.label}
              </h3>
              <Badge
                variant="secondary"
                className="shrink-0 rounded-md border border-border/60 bg-background/80 px-1.5 py-0 text-[10.5px] font-medium tabular-nums text-muted-foreground"
                aria-label={`${columnItems.length} ${columnItems.length === 1 ? 'task' : 'tasks'}`}
              >
                {columnItems.length}
              </Badge>
            </div>
            <div
              className="tasks-board-column-body grid gap-2"
              ref={(el) => {
                if (!el) return
                const rects = Array.from(el.querySelectorAll('[data-task-card-id]')).map((cardEl) => {
                  const rect = cardEl.getBoundingClientRect()
                  const id = Number(cardEl.getAttribute('data-task-card-id'))
                  return { id, top: rect.top, bottom: rect.bottom, mid: rect.top + rect.height / 2 }
                }).filter((r) => !drag || r.id !== drag.taskId)
                cardRectsRef.current.set(column.id, rects)
              }}
            >
              {visibleItems.length ? (
                visibleItems.map((task, index) => (
                  <div key={task.id} className="grid gap-2">
                    {isOver && insertIndex === index && <div className="tasks-drop-indicator" aria-hidden="true" />}
                    <TaskCard
                      task={task}
                      compact
                      draggable={!readOnly}
                      dataTaskId={task.id}
                      isDragging={drag?.taskId === task.id}
                      onPointerDown={readOnly ? undefined : (event) => startDrag(task, event)}
                      onStatusChange={readOnly ? undefined : onStatusChange}
                      onPriorityChange={readOnly ? undefined : onPriorityChange}
                      onDelete={readOnly ? undefined : onDelete}
                      onOpen={handleOpen}
                      busy={typeof isStatusPending === 'function' ? isStatusPending(task.id) : false}
                      readOnly={readOnly}
                      activeWorkspaceId={activeWorkspaceId}
                    />
                  </div>
                ))
              ) : (
                <div className={cn(
                  'tasks-board-empty flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-[10px] border border-dashed px-3 py-4 text-center',
                  isOver ? 'border-foreground/30 bg-background/80' : 'border-border/80 bg-background/50',
                )}>
                  <Inbox size={15} aria-hidden="true" className="text-muted-foreground/70" />
                  <p className="text-[12px] font-medium text-muted-foreground">
                    {isOver ? 'Drop task here' : 'No tasks yet'}
                  </p>
                </div>
              )}
              {isOver && insertIndex === visibleItems.length && visibleItems.length > 0 && (
                <div className="tasks-drop-indicator" aria-hidden="true" />
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}
