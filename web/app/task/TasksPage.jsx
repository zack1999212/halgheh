import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import ConfirmDialog from '@/components/shared/ConfirmDialog.jsx'
import FormError from '@/components/shared/FormError'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast.jsx'
import { cn } from '@/lib/utils'
import { getCurrentUser } from '../auth/api.js'
import { clearSession } from '../auth/api.js'
import { useActiveWorkspace } from '../workspace/ActiveWorkspaceContext.jsx'
import { ALL_WORKSPACES } from '../workspace/constants.js'
import TasksToolbar from './TasksToolbar.jsx'
import TasksFilters from './TasksFilters.jsx'
import TaskListView from './TaskListView.jsx'
import TaskBoardView from './TaskBoardView.jsx'
import TaskStatistics from './TaskStatistics.jsx'
import TaskDialog from './TaskDialog.jsx'
import TaskDetailPanel from './TaskDetailPanel.jsx'
import useTasks from './hooks/useTasks.js'
import useTaskFilters from './hooks/useTaskFilters.js'
import useTaskMutations from './hooks/useTaskMutations.js'
import { deleteTask as deleteTaskApi, getTask, listLabels, listTasks } from './api.js'
import './tasks.css'

const VALID_VIEWS = new Set(['kanban', 'list'])

export default function TasksPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { toast } = useToast()
  const rawView = searchParams.get('view')
  const view = VALID_VIEWS.has(rawView) ? rawView : 'kanban'
  const dialogParam = searchParams.get('dialog')
  const dialogTaskIdParam = searchParams.get('taskId')
  const dialogMode = dialogParam === 'edit' ? 'edit' : dialogParam === 'create' ? 'create' : null
  const dialogTaskId = dialogMode === 'edit' ? Number.parseInt(dialogTaskIdParam || '', 10) : null
  const dialogOpen = dialogMode === 'create' || dialogMode === 'edit'
  const [dialogTask, setDialogTask] = useState(null)
  const [dialogTaskError, setDialogTaskError] = useState('')
  const [dialogTaskLoading, setDialogTaskLoading] = useState(false)
  const taskParam = searchParams.get('task')
  const selectedTaskId = taskParam ? Number.parseInt(taskParam, 10) || null : null
  const [detailsRefreshKey, setDetailsRefreshKey] = useState(0)

  const setSelectedTaskId = useCallback((id) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (id) next.set('task', String(id))
      else next.delete('task')
      return next
    }, { replace: !id })
  }, [setSearchParams])
  const [actionError, setActionError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [currentUser, setCurrentUser] = useState(null)
  const [labelOptions, setLabelOptions] = useState([])
  const [parentOptions, setParentOptions] = useState([])
  const { workspaceScope: globalWorkspaceScope, defaultWorkspaceId, workspaces } = useActiveWorkspace()
  const [workspaceScope, setWorkspaceScope] = useState(globalWorkspaceScope ?? ALL_WORKSPACES)

  useEffect(() => {
    if (globalWorkspaceScope != null) {
      setWorkspaceScope(globalWorkspaceScope)
    }
  }, [globalWorkspaceScope])

  const setView = useCallback((nextView) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (nextView === 'list') next.set('view', 'list')
      else next.delete('view')
      return next
    }, { replace: true })
  }, [setSearchParams])

  const closeDialog = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('dialog')
      next.delete('taskId')
      return next
    }, { replace: true })
  }, [setSearchParams])

  const openCreateDialog = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('dialog', 'create')
      next.delete('taskId')
      return next
    })
  }, [setSearchParams])

  const openEditDialog = useCallback((task) => {
    if (!task?.id) return
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('dialog', 'edit')
      next.set('taskId', String(task.id))
      return next
    })
  }, [setSearchParams])

  const handleUnauthorized = useCallback(() => {
    clearSession()
    navigate('/login', { replace: true })
  }, [navigate])

  const {
    activeNavId,
    activeNav,
    filters,
    limit,
    offset,
    query,
    setFilters,
    selectNav,
    nextPage,
    prevPage,
    resetPagination,
  } = useTaskFilters({ workspaceScope })

  useEffect(() => {
    resetPagination?.()
  }, [workspaceScope, resetPagination])

  const effectiveQuery = useMemo(
    () =>
      view === 'kanban'
        ? { ...query, sort: 'position', order: 'asc' }
        : query,
    [view, query]
  )

  const { items, total, statistics, loading, loadingMore, statsLoading, error, statsError, hasMore, reload, loadMore, replaceItem, setItems } = useTasks({
    query: effectiveQuery,
    onUnauthorized: handleUnauthorized,
  })

  const { changeStatus, changePriority, moveTask, isStatusPending } = useTaskMutations({
    onUnauthorized: handleUnauthorized,
    onError: (message) => {
      setActionError(message)
      toast({ title: 'Task action failed', description: message, variant: 'destructive' })
    },
  })

  useEffect(() => {
    let active = true
    getCurrentUser()
      .then((user) => { if (active) setCurrentUser(user) })
      .catch((err) => { if (active && err?.status === 401) handleUnauthorized() })
    return () => { active = false }
  }, [handleUnauthorized])

  const loadDialogData = useCallback(async () => {
    try {
      const [labelsRes, tasksRes] = await Promise.all([
        listLabels({ limit: 100 }).catch(() => ({ items: [] })),
        listTasks({ scope: 'visible', limit: 100, sort: 'updated_at', order: 'desc' }).catch(() => ({ items: [] })),
      ])
      setLabelOptions(Array.isArray(labelsRes?.items) ? labelsRes.items : [])
    } catch {
      // non-blocking
    }
  }, [])

  useEffect(() => {
    loadDialogData()
  }, [loadDialogData])

  const createWorkspaceId = workspaceScope !== ALL_WORKSPACES ? workspaceScope : defaultWorkspaceId

  useEffect(() => {
    let active = true
    if (dialogMode !== 'edit') {
      setDialogTask(null)
      setDialogTaskError('')
      setDialogTaskLoading(false)
      return () => { active = false }
    }
    if (!Number.isFinite(dialogTaskId) || dialogTaskId <= 0) {
      setDialogTask(null)
      setDialogTaskError('Invalid task ID.')
      setDialogTaskLoading(false)
      return () => { active = false }
    }
    setDialogTaskLoading(true)
    setDialogTaskError('')
    getTask(dialogTaskId)
      .then((task) => {
        if (!active) return
        setDialogTask(task)
      })
      .catch((err) => {
        if (!active) return
        if (err?.status === 401) {
          handleUnauthorized()
          return
        }
        setDialogTask(null)
        setDialogTaskError(err?.message || 'Could not load the task.')
      })
      .finally(() => {
        if (active) setDialogTaskLoading(false)
      })
    return () => { active = false }
  }, [dialogMode, dialogTaskId, handleUnauthorized])

  const loadedCount = items.length

  async function handleStatusChange(task, status) {
    if (!task?.id || !status || task.status === status) return
    setActionError('')

    const result = await changeStatus(task, status, {
      optimistic: (current) => {
        const previousStatus = current.status
        const previousPosition = current.position
        replaceItem(current.id, (item) => ({ ...item, status }))
        return () => replaceItem(current.id, (item) => ({ ...item, status: previousStatus, position: previousPosition }))
      },
    })

    if (!result.ok && !result.skipped) return

    reload()
    if (selectedTaskId === task.id) setDetailsRefreshKey((k) => k + 1)
  }

  async function handlePriorityChange(task, priority) {
    if (!task?.id || !priority || task.priority === priority) return
    setActionError('')

    const result = await changePriority(task, priority, {
      optimistic: (current) => {
        const prevPriority = current.priority
        const prevPriorityPosition = current.priority_position
        replaceItem(current.id, (item) => ({ ...item, priority }))
        return () => replaceItem(current.id, (item) => ({ ...item, priority: prevPriority, priority_position: prevPriorityPosition }))
      },
    })

    if (!result.ok && !result.skipped) return
    if (result.ok && result.result) {
      replaceItem(task.id, () => result.result)
      if (selectedTaskId === task.id) setDetailsRefreshKey((k) => k + 1)
      return
    }
    reload()
    if (selectedTaskId === task.id) setDetailsRefreshKey((k) => k + 1)
  }

  async function handleMoveTask(task, payload) {
    if (!task?.id) return
    const isStatusMove = !!payload?.target_status
    const isPriorityMove = !!payload?.target_priority
    if (!isStatusMove && !isPriorityMove) return
    setActionError('')

    const previousItems = items
    const result = await moveTask(task, payload, {
      optimistic: (current) => {
        setItems((prev) => {
          const next = prev.map((item) => (item.id === current.id ? { ...item } : item))
          const moved = next.find((item) => item.id === current.id)
          if (!moved) return prev
          if (isStatusMove) {
            moved.status = payload.target_status
            const columnItems = next
              .filter((item) => item.status === payload.target_status && item.id !== current.id)
              .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id - b.id)
            const beforePos = payload.before_task_id ? columnItems.find((i) => i.id === payload.before_task_id)?.position : null
            const afterPos = payload.after_task_id ? columnItems.find((i) => i.id === payload.after_task_id)?.position : null
            if (beforePos != null && afterPos != null) moved.position = beforePos + Math.max(1, Math.floor((afterPos - beforePos) / 2))
            else if (beforePos != null) moved.position = beforePos + 1000
            else if (afterPos != null) moved.position = afterPos - 1000
            else moved.position = columnItems.length ? (columnItems[columnItems.length - 1].position ?? 0) + 1000 : 1000
          } else {
            moved.priority = payload.target_priority
            const columnItems = next
              .filter((item) => item.priority === payload.target_priority && item.id !== current.id)
              .sort((a, b) => (a.priority_position ?? 0) - (b.priority_position ?? 0) || a.id - b.id)
            const beforePos = payload.before_task_id ? columnItems.find((i) => i.id === payload.before_task_id)?.priority_position : null
            const afterPos = payload.after_task_id ? columnItems.find((i) => i.id === payload.after_task_id)?.priority_position : null
            if (beforePos != null && afterPos != null) moved.priority_position = beforePos + Math.max(1, Math.floor((afterPos - beforePos) / 2))
            else if (beforePos != null) moved.priority_position = beforePos + 1000
            else if (afterPos != null) moved.priority_position = afterPos - 1000
            else moved.priority_position = columnItems.length ? (columnItems[columnItems.length - 1].priority_position ?? 0) + 1000 : 1000
          }
          return next
        })
        return () => setItems(previousItems)
      },
    })

    if (!result.ok && !result.skipped) {
      reload()
      return
    }

    if (result.ok && result.result) {
      replaceItem(task.id, () => result.result)
      // Avoid full board reload/flash; local state is authoritative enough.
      if (selectedTaskId === task.id) setDetailsRefreshKey((k) => k + 1)
    }
  }

  function openCreate() {
    loadDialogData()
    openCreateDialog()
  }

  function openEdit(task) {
    loadDialogData()
    openEditDialog(task)
  }

  function requestDelete(task) {
    if (!task?.id || deleteBusy) return
    setDeleteError('')
    setDeleteTarget(task)
  }

  async function confirmDelete() {
    if (!deleteTarget?.id || deleteBusy) return
    setDeleteBusy(true)
    setDeleteError('')
    try {
      await deleteTaskApi(deleteTarget.id)
      const deletedId = deleteTarget.id
      setDeleteTarget(null)
      setDeleteError('')
      setItems((prev) => prev.filter((item) => item.id !== deletedId))
      if (selectedTaskId === deletedId) setSelectedTaskId(null)
      reload()
      toast({ title: 'Task deleted successfully' })
    } catch (err) {
      if (err?.status === 401) {
        handleUnauthorized()
        return
      }
      const msg = err?.status === 403
        ? 'You do not have permission to delete this task.'
        : err?.status === 404
          ? 'Task was not found. It may have already been deleted.'
          : (err?.message || 'Could not delete the task.')
      setDeleteError(msg)
      toast({ title: 'Task deletion failed', description: msg, variant: 'destructive' })
      if (err?.status === 404) {
        const deletedId = deleteTarget.id
        setDeleteTarget(null)
        setItems((prev) => prev.filter((item) => item.id !== deletedId))
        if (selectedTaskId === deletedId) setSelectedTaskId(null)
        reload()
      }
    } finally {
      setDeleteBusy(false)
    }
  }

  function handleSaved(info) {
    reload()
    loadDialogData()
    if (selectedTaskId) setDetailsRefreshKey((k) => k + 1)
    if (info?.mode === 'edit') toast({ title: 'Task updated successfully' })
    else toast({ title: 'Task created successfully' })
  }

  const pagination = (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
      <p className="text-[12.5px] text-muted-foreground">
        {total === 0 ? 'No results' : `Showing ${loadedCount} of ${total} tasks`}
      </p>
      <div className="flex items-center gap-2">
        {hasMore && (
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1" onClick={loadMore} disabled={loadingMore || loading}>
            {loadingMore ? 'Loading…' : 'Load more'}
          </Button>
        )}
      </div>
    </div>
  )

  return (
    <div className="tasks-page">
      <TasksToolbar
        view={view}
        onViewChange={setView}
        onCreate={openCreate}
        activeLabel={activeNav.label}
        total={total}
      />

      <div className="tasks-body tasks-body--board">
        <section className="tasks-surface" aria-label="Tasks content">
          <div className={cn('tasks-surface-inner flex flex-col gap-4', view === 'kanban' && 'tasks-surface-inner--board')}>
            <TaskStatistics
              statistics={statistics}
              loading={statsLoading}
              error={statsError}
              onRetry={reload}
            />

            <TasksFilters
              filters={filters}
              onChange={setFilters}
              view={view}
              workspaceScope={workspaceScope}
              onWorkspaceScopeChange={setWorkspaceScope}
              workspaces={workspaces}
            />

            <FormError>{actionError}</FormError>

            {view === 'list' ? (
              <TaskListView
                items={items}
                loading={loading}
                error={error}
                onRetry={reload}
                onStatusChange={handleStatusChange}
                onPriorityChange={handlePriorityChange}
                onDelete={requestDelete}
                onOpen={(id) => setSelectedTaskId(id)}
                isStatusPending={isStatusPending}
                selectedTaskId={selectedTaskId}
                activeWorkspaceId={workspaceScope !== ALL_WORKSPACES ? workspaceScope : null}
              />
            ) : (
              <TaskBoardView
                items={items}
                loading={loading}
                error={error}
                onRetry={reload}
                onStatusChange={handleStatusChange}
                onPriorityChange={handlePriorityChange}
                onDelete={requestDelete}
                onMoveTask={handleMoveTask}
                onOpen={(id) => setSelectedTaskId(id)}
                statusBusyId={null}
                isStatusPending={isStatusPending}
                activeWorkspaceId={workspaceScope !== ALL_WORKSPACES ? workspaceScope : null}
              />
            )}

            {pagination}
          </div>
        </section>
      </div>

      <TaskDialog
        open={dialogOpen}
        mode={dialogMode || 'create'}
        task={dialogMode === 'edit' ? dialogTask : null}
        loading={dialogMode === 'edit' && dialogTaskLoading}
        loadError={dialogMode === 'edit' ? dialogTaskError : ''}
        onChanged={() => { reload(); setDetailsRefreshKey((k) => k + 1) }}
        availableLabels={labelOptions}
        workspaceId={createWorkspaceId}
        onClose={closeDialog}
        onSaved={handleSaved}
      />

      <TaskDetailPanel
        taskId={selectedTaskId}
        currentUserId={currentUser?.id ?? null}
        refreshKey={detailsRefreshKey}
        onClose={() => setSelectedTaskId(null)}
        onEdit={(task) => openEdit(task)}
        onDeleted={() => { setSelectedTaskId(null); reload() }}
        onOpenTask={(id) => setSelectedTaskId(id)}
        onUnauthorized={handleUnauthorized}
        onChanged={() => { reload(); setDetailsRefreshKey((k) => k + 1) }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete task permanently?"
        description={deleteTarget ? `“${deleteTarget.title}” will be permanently deleted. This action cannot be undone.` : 'This action cannot be undone.'}
        confirmLabel="Delete permanently"
        busyLabel="Deleting…"
        busy={deleteBusy}
        error={deleteError}
        contentClassName="tasks-dialog"
        onConfirm={confirmDelete}
        onClose={() => { if (!deleteBusy) { setDeleteTarget(null); setDeleteError('') } }}
      />
    </div>
  )
}
