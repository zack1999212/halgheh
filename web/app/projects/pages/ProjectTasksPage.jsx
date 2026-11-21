import { useCallback, useEffect, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import FormError from '@/components/shared/FormError'
import { Button } from '@/components/ui/button'
import { getCurrentUser } from '../../auth/api.js'
import TasksToolbar from '../../task/TasksToolbar.jsx'
import TasksSidebar from '../../task/TasksSidebar.jsx'
import TasksFilters from '../../task/TasksFilters.jsx'
import TaskListView from '../../task/TaskListView.jsx'
import TaskBoardView from '../../task/TaskBoardView.jsx'
import TaskDialog from '../../task/TaskDialog.jsx'
import TaskDetailPanel from '../../task/TaskDetailPanel.jsx'
import useTasks from '../../task/hooks/useTasks.js'
import useTaskFilters from '../../task/hooks/useTaskFilters.js'
import useTaskMutations from '../../task/hooks/useTaskMutations.js'
import { listLabels, listTasks } from '../../task/api.js'
import '../../task/tasks.css'

function canManageContent(role) {
  return role === 'owner' || role === 'admin' || role === 'editor'
}

export default function ProjectTasksPage() {
  const { projectId } = useParams()
  const outlet = useOutletContext() || {}
  const role = outlet.role || outlet.project?.current_user_role
  const canManage = canManageContent(role)
  const readOnly = !canManage

  const [view, setView] = useState('list')
  const [dialog, setDialog] = useState({ open: false, mode: 'create', task: null })
  const [selectedTaskId, setSelectedTaskId] = useState(null)
  const [detailsRefreshKey, setDetailsRefreshKey] = useState(0)
  const [currentUserId, setCurrentUserId] = useState(null)
  const [actionError, setActionError] = useState('')
  const [labels, setLabels] = useState([])
  const [labelsError, setLabelsError] = useState('')
  const [allTasksForDialog, setAllTasksForDialog] = useState([])

  const handleUnauthorized = useCallback(() => {
    outlet.onUnauthorized?.()
  }, [outlet])

  const filtersState = useTaskFilters({ projectId, projectMode: true })
  const tasks = useTasks({ query: filtersState.query, onUnauthorized: handleUnauthorized, loadStatistics: false })
  const mutations = useTaskMutations({
    onUnauthorized: handleUnauthorized,
    onError: (msg) => setActionError(msg),
    onSettled: tasks.reload,
  })

  useEffect(() => {
    let cancelled = false
    async function loadUser() {
      try {
        const user = await getCurrentUser()
        if (!cancelled) setCurrentUserId(user?.id ?? null)
      } catch (err) {
        if (err?.status === 401) {
          handleUnauthorized()
          return
        }
        if (!cancelled) setCurrentUserId(null)
      }
    }
    loadUser()
    return () => { cancelled = true }
  }, [handleUnauthorized])

  useEffect(() => {
    let cancelled = false
    async function loadLabels() {
      setLabelsError('')
      try {
        const data = await listLabels({ limit: 100 })
        if (!cancelled) setLabels(Array.isArray(data?.items) ? data.items : [])
      } catch (err) {
        if (err?.status === 401) {
          handleUnauthorized()
          return
        }
        if (!cancelled) setLabelsError(err?.message || 'Could not load labels.')
      }
    }
    loadLabels()
    return () => { cancelled = true }
  }, [handleUnauthorized])

  const refreshDialogTaskOptions = useCallback(async () => {
    try {
      const data = await listTasks({ limit: 100, sort: 'updated_at', order: 'desc', project_id: projectId })
      setAllTasksForDialog(Array.isArray(data?.items) ? data.items : [])
    } catch {
      setAllTasksForDialog([])
    }
  }, [projectId])

  function openCreateDialog() {
    if (readOnly) return
    setActionError('')
    refreshDialogTaskOptions()
    setDialog({ open: true, mode: 'create', task: null })
  }

  async function openEditDialog(task) {
    if (readOnly) return
    setActionError('')
    await refreshDialogTaskOptions()
    setDialog({ open: true, mode: 'edit', task })
  }

  function closeDialog() {
    setDialog({ open: false, mode: 'create', task: null })
  }

  async function handleStatusChange(task, nextStatus) {
    if (readOnly) return
    setActionError('')
    await mutations.changeStatus(task, nextStatus)
  }

  function handleAfterMutation() {
    setDetailsRefreshKey((k) => k + 1)
    tasks.reload()
  }

  const listView = view === 'list' ? (
    <TaskListView
      items={tasks.items}
      loading={tasks.loading}
      error={tasks.error}
      onRetry={tasks.reload}
      onStatusChange={readOnly ? undefined : handleStatusChange}
      onOpen={(id) => setSelectedTaskId(id)}
      isStatusPending={mutations.isStatusPending}
      readOnly={readOnly}
      emptyTitle="No project tasks found"
      emptyDescription={readOnly ? 'No tasks have been created for this project yet.' : 'Try adjusting filters or create a new project task.'}
    />
  ) : (
    <TaskBoardView
      items={tasks.items}
      loading={tasks.loading}
      error={tasks.error}
      onRetry={tasks.reload}
      onStatusChange={readOnly ? undefined : handleStatusChange}
      onOpen={(id) => setSelectedTaskId(id)}
      isStatusPending={mutations.isStatusPending}
      readOnly={readOnly}
      emptyTitle="No project tasks found"
      emptyDescription={readOnly ? 'No tasks have been created for this project yet.' : 'Try adjusting filters or create a new project task.'}
    />
  )

  const showingFrom = tasks.total === 0 ? 0 : filtersState.offset + 1
  const showingTo = Math.min(filtersState.offset + tasks.items.length, tasks.total)
  const canPrev = filtersState.offset > 0
  const canNext = filtersState.offset + filtersState.limit < tasks.total

  return (
    <div className="tasks-page tasks-shell flex flex-col gap-4 p-4 md:p-5" data-testid="project-tasks-page">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="m-0 text-xl font-semibold tracking-[-0.02em]">Tasks</h2>
          <p className="mt-1 text-[13.5px] text-muted-foreground">Project-scoped tasks, assignments, status, and details. Progress is calculated by the backend and reflected in Project Overview after task updates.</p>
        </div>
        {readOnly && (
          <span className="inline-flex rounded-full border border-border bg-card px-2.5 py-1 text-[12px] font-medium text-muted-foreground">View only</span>
        )}
      </div>

      <FormError>{actionError}</FormError>
      {labelsError && <FormError>{labelsError}</FormError>}

      <TasksToolbar
        view={view}
        onViewChange={setView}
        onCreate={openCreateDialog}
        activeLabel={filtersState.activeNav.label}
        total={tasks.total}
        title="Project tasks"
        canCreate={canManage}
      />

      <div className="tasks-workspace">
        <div className="tasks-main">
          <TasksSidebar
            activeId={filtersState.activeNavId}
            onSelect={filtersState.selectNav}
            items={filtersState.navItems}
            note="Project task views are scoped to this project. Progress metrics shown in Overview are calculated by the backend."
          />
          <div className="tasks-content">
            <TasksFilters
              filters={filtersState.filters}
              limit={filtersState.limit}
              onChange={filtersState.setFilters}
              onLimitChange={filtersState.setLimit}
            />
            <div className="tasks-grid">{listView}</div>

            {!tasks.loading && !tasks.error && tasks.total > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                <p className="text-[12.5px] text-muted-foreground" aria-live="polite">
                  Showing {showingFrom}-{showingTo} of {tasks.total}
                </p>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" className="h-8 gap-1" onClick={filtersState.prevPage} disabled={!canPrev}>
                    <ChevronLeft size={14} aria-hidden="true" /> Previous
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-8 gap-1" onClick={() => filtersState.nextPage(tasks.total)} disabled={!canNext}>
                    Next <ChevronRight size={14} aria-hidden="true" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <TaskDialog
        open={dialog.open}
        mode={dialog.mode}
        task={dialog.task}
        allTasks={allTasksForDialog}
        availableLabels={labels}
        projectId={projectId}
        onClose={closeDialog}
        onSaved={handleAfterMutation}
      />

      <TaskDetailPanel
        taskId={selectedTaskId}
        currentUserId={currentUserId}
        refreshKey={detailsRefreshKey}
        readOnly={readOnly}
        canManage={canManage}
        canComment={canManage}
        onClose={() => setSelectedTaskId(null)}
        onEdit={(task) => { if (!readOnly) openEditDialog(task) }}
        onDeleted={handleAfterMutation}
        onOpenTask={(id) => setSelectedTaskId(id)}
        onUnauthorized={handleUnauthorized}
        onChanged={handleAfterMutation}
      />
    </div>
  )
}
