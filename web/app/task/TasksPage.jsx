import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import FormError from '@/components/shared/FormError'
import { Button } from '@/components/ui/button'
import { getCurrentUser } from '../auth/api.js'
import { clearToken } from '../src/api.js'
import TasksToolbar from './TasksToolbar.jsx'
import TasksSidebar from './TasksSidebar.jsx'
import TasksFilters from './TasksFilters.jsx'
import TaskListView from './TaskListView.jsx'
import TaskBoardView from './TaskBoardView.jsx'
import TaskStatistics from './TaskStatistics.jsx'
import TaskDialog from './TaskDialog.jsx'
import TaskDetailPanel from './TaskDetailPanel.jsx'
import useTasks from './hooks/useTasks.js'
import useTaskFilters from './hooks/useTaskFilters.js'
import useTaskMutations from './hooks/useTaskMutations.js'
import { listLabels, listTasks } from './api.js'
import './tasks.css'

export default function TasksPage() {
  const navigate = useNavigate()
  const [view, setView] = useState('list')
  const [dialog, setDialog] = useState({ open: false, mode: 'create', task: null })
  const [selectedTaskId, setSelectedTaskId] = useState(null)
  const [detailsRefreshKey, setDetailsRefreshKey] = useState(0)
  const [actionError, setActionError] = useState('')
  const [currentUser, setCurrentUser] = useState(null)
  const [labelOptions, setLabelOptions] = useState([])
  const [parentOptions, setParentOptions] = useState([])

  const handleUnauthorized = useCallback(() => {
    clearToken()
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
  } = useTaskFilters()

  const { items, total, statistics, loading, statsLoading, error, statsError, reload, replaceItem } = useTasks({
    query,
    onUnauthorized: handleUnauthorized,
  })

  const { changeStatus, isStatusPending } = useTaskMutations({
    onUnauthorized: handleUnauthorized,
    onError: (message) => setActionError(message),
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
      setParentOptions(Array.isArray(tasksRes?.items) ? tasksRes.items : [])
    } catch {
      // non-blocking
    }
  }, [])

  useEffect(() => {
    loadDialogData()
  }, [loadDialogData])

  const pageStart = total === 0 ? 0 : offset + 1
  const pageEnd = Math.min(offset + items.length, total)
  const canPrev = offset > 0
  const canNext = offset + limit < total

  async function handleStatusChange(task, status) {
    if (!task?.id || !status || task.status === status) return
    setActionError('')

    const result = await changeStatus(task, status, {
      optimistic: (current) => {
        const previousStatus = current.status
        replaceItem(current.id, (item) => ({ ...item, status }))
        return () => replaceItem(current.id, (item) => ({ ...item, status: previousStatus }))
      },
    })

    if (!result.ok && !result.skipped) return

    reload()
    if (selectedTaskId === task.id) setDetailsRefreshKey((k) => k + 1)
  }

  function openCreate() {
    loadDialogData()
    setDialog({ open: true, mode: 'create', task: null })
  }

  function openEdit(task) {
    loadDialogData()
    setDialog({ open: true, mode: 'edit', task })
  }

  function handleSaved() {
    reload()
    loadDialogData()
    if (selectedTaskId) setDetailsRefreshKey((k) => k + 1)
  }

  const pagination = (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
      <p className="text-[12.5px] text-muted-foreground">
        {total === 0 ? 'No results' : `Showing ${pageStart}-${pageEnd} of ${total}`}
      </p>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1" onClick={prevPage} disabled={!canPrev || loading}>
          <ChevronLeft size={14} aria-hidden="true" /> Previous
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1" onClick={() => nextPage(total)} disabled={!canNext || loading}>
          Next <ChevronRight size={14} aria-hidden="true" />
        </Button>
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

      <div className="tasks-body">
        <TasksSidebar activeId={activeNavId} onSelect={selectNav} />

        <section className="tasks-surface" aria-label="Tasks content">
          <div className="tasks-surface-inner grid gap-4">
            <TaskStatistics
              statistics={statistics}
              loading={statsLoading}
              error={statsError}
              onRetry={reload}
            />

            <TasksFilters filters={filters} onChange={setFilters} />

            <FormError>{actionError}</FormError>

            {view === 'list' ? (
              <TaskListView
                items={items}
                loading={loading}
                error={error}
                onRetry={reload}
                onStatusChange={handleStatusChange}
                onOpen={(id) => setSelectedTaskId(id)}
                statusBusyId={null}
                isStatusPending={isStatusPending}
              />
            ) : (
              <TaskBoardView
                items={items}
                loading={loading}
                error={error}
                onRetry={reload}
                onStatusChange={handleStatusChange}
                onOpen={(id) => setSelectedTaskId(id)}
                statusBusyId={null}
                isStatusPending={isStatusPending}
              />
            )}

            {pagination}
          </div>
        </section>
      </div>

      <TaskDialog
        open={dialog.open}
        mode={dialog.mode}
        task={dialog.task}
        allTasks={parentOptions}
        availableLabels={labelOptions}
        onClose={() => setDialog({ open: false, mode: 'create', task: null })}
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
    </div>
  )
}
