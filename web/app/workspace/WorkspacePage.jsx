import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import RadioOption from '@/components/shared/RadioOption'
import EventDetailPanel from '../calendar/EventDetailPanel.jsx'
import EventDialog from '../calendar/EventDialog.jsx'
import { createException, deleteEvent } from '../calendar/api.js'
import { clearSession } from '../auth/api.js'
import { useActiveWorkspace } from './ActiveWorkspaceContext.jsx'
import { ALL_WORKSPACES } from './constants.js'
import useWorkspaceCalendarData from './hooks/useWorkspaceCalendarData.js'
import useWorkspaceDocumentsData from './hooks/useWorkspaceDocumentsData.js'
import useWorkspaceTasksData from './hooks/useWorkspaceTasksData.js'
import { useWorkspaceTheme } from './hooks/useWorkspaceTheme.js'
import WorkspaceHeader from './components/WorkspaceHeader.jsx'
import OverviewCards from './components/OverviewCards.jsx'
import QuickActions from './components/QuickActions.jsx'
import TodaySchedule from './components/sections/TodaySchedule.jsx'
import TodayTasks from './components/sections/TodayTasks.jsx'
import UpcomingEvents from './components/sections/UpcomingEvents.jsx'
import UpcomingTasks from './components/sections/UpcomingTasks.jsx'
import RecentDocuments from './components/sections/RecentDocuments.jsx'
import './workspace.css'

export default function WorkspacePage() {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useWorkspaceTheme()
  const {
    activeWorkspaceId,
    workspaceScope,
    isAllWorkspaces,
    defaultWorkspaceId,
    status: workspaceStatus,
  } = useActiveWorkspace()
  const workspaceReady = workspaceStatus === 'ready' && workspaceScope != null
  const hookWorkspaceId = isAllWorkspaces ? ALL_WORKSPACES : activeWorkspaceId

  const handleUnauthorized = useCallback(() => {
    clearSession()
    navigate('/login', { replace: true })
  }, [navigate])

  const calendar = useWorkspaceCalendarData({ onUnauthorized: handleUnauthorized, workspaceId: hookWorkspaceId })
  const documents = useWorkspaceDocumentsData({ onUnauthorized: handleUnauthorized, workspaceId: hookWorkspaceId })
  const tasks = useWorkspaceTasksData({ onUnauthorized: handleUnauthorized, workspaceId: hookWorkspaceId })

  const [selectedItem, setSelectedItem] = useState(null)
  const [detailsRefreshKey, setDetailsRefreshKey] = useState(0)
  const [editor, setEditor] = useState({
    open: false,
    mode: 'create',
    event: null,
    occurrence: null,
    calendarId: null,
  })
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteScope, setDeleteScope] = useState('series')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const workspacePending = !workspaceReady
  const calendarLoading = workspacePending || calendar.loading
  const documentsLoading = workspacePending || documents.loading
  const tasksLoading = workspacePending || tasks.loading
  const calendarError = calendar.error
  const documentsError = documents.error
  const tasksError = tasks.error
  const canCreateEvent = workspaceReady && !calendar.loading && calendar.calendars.length > 0

  const openCreateEvent = useCallback(() => {
    if (!calendar.calendars.length) return
    const defaultCal =
      calendar.calendars.find((c) => c.is_default) || calendar.calendars[0]
    setEditor({
      open: true,
      mode: 'create',
      event: null,
      occurrence: null,
      calendarId: defaultCal?.id ?? null,
    })
  }, [calendar.calendars])

  const openEvent = useCallback((item) => {
    if (!item) return
    setSelectedItem(item)
  }, [])

  const closeDetail = useCallback(() => setSelectedItem(null), [])

  const refreshCalendar = useCallback(() => {
    calendar.reload()
    setDetailsRefreshKey((k) => k + 1)
  }, [calendar])

  const handleEdit = useCallback(
    (event, occurrence) => {
      if (!selectedItem) return
      setEditor({
        open: true,
        mode: 'edit',
        event,
        occurrence,
        calendarId: selectedItem.calendar?.id ?? selectedItem.occurrence?.calendar_id ?? null,
      })
    },
    [selectedItem]
  )

  const openDelete = useCallback((event, occurrence) => {
    if (!selectedItem) return
    setDeleteError('')
    setDeleteScope(event?.recurrence_rule ? 'occurrence' : 'series')
    setDeleteTarget({
      event,
      occurrence,
      calendarId: selectedItem.calendar?.id ?? null,
    })
  }, [selectedItem])

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget?.event || !deleteTarget?.calendarId) return
    setDeleteBusy(true)
    setDeleteError('')
    try {
      const isRecurring = Boolean(deleteTarget.event.recurrence_rule)
      if (isRecurring && deleteScope === 'occurrence') {
        await createException(deleteTarget.calendarId, deleteTarget.event.id, {
          original_start_at: deleteTarget.occurrence?.originalStartAt ?? null,
          original_start_date: deleteTarget.occurrence?.originalStartDate ?? null,
          is_cancelled: true,
        })
      } else {
        await deleteEvent(deleteTarget.calendarId, deleteTarget.event.id)
      }
      setDeleteTarget(null)
      setSelectedItem(null)
      refreshCalendar()
    } catch (err) {
      setDeleteError(err?.message || 'Could not delete the event.')
    } finally {
      setDeleteBusy(false)
    }
  }, [deleteTarget, deleteScope, refreshCalendar])

  const handleSaved = useCallback(() => {
    setEditor((s) => ({ ...s, open: false, mode: 'create', event: null, occurrence: null }))
    setSelectedItem(null)
    refreshCalendar()
  }, [refreshCalendar])

  const selectedOccurrence = selectedItem?.selection || null
  const selectedCalendar = selectedItem?.calendar || null

  return (
    <div className="workspace-page" data-theme={theme}>
      <div className="ws-blob ws-blob-1" aria-hidden="true" />
      <div className="ws-blob ws-blob-2" aria-hidden="true" />
      <div className="ws-blob ws-blob-3" aria-hidden="true" />

      <div className="relative z-10 flex flex-col gap-4 sm:gap-5">
        <WorkspaceHeader
          timeZone={calendar.timeZone}
          theme={theme}
          onToggleTheme={toggleTheme}
        />

        <OverviewCards
          calendarLoading={calendarLoading}
          calendarError={calendarError}
          documentsLoading={documentsLoading}
          documentsError={documentsError}
          tasksLoading={tasksLoading}
          tasksError={tasksError}
          timeZone={calendar.timeZone}
          todayCount={calendar.todayCount}
          nextTodayEvent={calendar.nextTodayEvent}
          upcomingCount={calendar.upcomingCount}
          nearestUpcoming={calendar.nearestUpcoming}
          documentsTotal={documents.total}
          activeTasksCount={tasks.activeCount}
          overdueTasksCount={tasks.overdueCount}
        />

        <div className="ws-grid">
          <div className="ws-col">
            <TodaySchedule
              loading={calendarLoading}
              error={calendarError}
              items={calendar.todayItems}
              timeZone={calendar.timeZone}
              onRetry={calendar.reload}
              onOpenEvent={openEvent}
              onCreateEvent={canCreateEvent ? openCreateEvent : undefined}
            />
            <UpcomingEvents
              loading={calendarLoading}
              error={calendarError}
              items={calendar.upcomingItems}
              timeZone={calendar.timeZone}
              onRetry={calendar.reload}
              onOpenEvent={openEvent}
              onCreateEvent={canCreateEvent ? openCreateEvent : undefined}
            />
          </div>
          <div className="ws-col">
            <TodayTasks
              loading={tasksLoading}
              error={tasksError}
              items={tasks.todayTasks}
              todayStr={tasks.todayStr}
              onRetry={tasks.reload}
            />
            <UpcomingTasks
              loading={tasksLoading}
              error={tasksError}
              items={tasks.upcomingTasks}
              onRetry={tasks.reload}
            />
            <RecentDocuments
              loading={documentsLoading}
              error={documentsError}
              documents={documents.documents}
              onRetry={documents.reload}
            />
            <QuickActions onCreateEvent={openCreateEvent} canCreateEvent={canCreateEvent} />
          </div>
        </div>

        {selectedOccurrence && selectedCalendar && (
          <EventDetailPanel
            occurrence={selectedOccurrence}
            calendar={selectedCalendar}
            refreshKey={detailsRefreshKey}
            onClose={closeDetail}
            onEdit={handleEdit}
            onDelete={openDelete}
            onUnauthorized={handleUnauthorized}
            onWorkspaceChanged={(info) => {
              refreshCalendar()
              if (
                info?.detachedWorkspaceId != null &&
                !isAllWorkspaces &&
                info.detachedWorkspaceId === activeWorkspaceId
              ) {
                setSelectedItem(null)
              } else if (info?.detachedWorkspaceId != null) {
                setSelectedItem((prev) => prev ? { ...prev, selection: { ...prev.selection, workspaces: Array.isArray(prev.selection?.workspaces) ? prev.selection.workspaces.filter((w) => w.id !== info.detachedWorkspaceId) : prev.selection?.workspaces } } : prev)
              } else if (info?.attachedWorkspace) {
                setSelectedItem((prev) => prev ? { ...prev, selection: { ...prev.selection, workspaces: Array.isArray(prev.selection?.workspaces) && !prev.selection.workspaces.some((w) => w.id === info.attachedWorkspace.id) ? [...prev.selection.workspaces, info.attachedWorkspace] : prev.selection?.workspaces } } : prev)
              }
            }}
          />
        )}

        <EventDialog
          open={editor.open}
          mode={editor.mode}
          event={editor.event}
          occurrence={editor.occurrence}
          calendarId={editor.calendarId}
          calendars={calendar.calendars}
          workspaceId={defaultWorkspaceId}
          onClose={() => setEditor((s) => ({ ...s, open: false }))}
          onSaved={handleSaved}
        />

        <ConfirmDialog
          open={Boolean(deleteTarget)}
          title="Delete event"
          description={
            deleteTarget?.event?.recurrence_rule
              ? 'This event repeats. Choose what to delete.'
              : `Delete “${deleteTarget?.event?.title || deleteTarget?.occurrence?.title || 'this event'}”?`
          }
          confirmLabel="Delete"
          busy={deleteBusy}
          error={deleteError}
          onConfirm={confirmDelete}
          onClose={() => {
            setDeleteTarget(null)
            setDeleteError('')
          }}
        >
          {deleteTarget?.event?.recurrence_rule && (
            <div className="grid gap-2">
              <RadioOption
                name="workspace-delete-scope"
                value="occurrence"
                title="This occurrence"
                description="Cancels only the selected occurrence."
                checked={deleteScope === 'occurrence'}
                onChange={() => setDeleteScope('occurrence')}
              />
              <RadioOption
                name="workspace-delete-scope"
                value="series"
                title="All occurrences"
                description="Deletes the whole series."
                checked={deleteScope === 'series'}
                onChange={() => setDeleteScope('series')}
              />
            </div>
          )}
        </ConfirmDialog>
      </div>
    </div>
  )
}