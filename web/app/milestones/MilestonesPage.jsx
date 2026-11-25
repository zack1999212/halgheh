import { useCallback, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Flag, Map } from 'lucide-react'
import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import LoadingState from '@/components/shared/LoadingState'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { clearSession } from '../auth/api.js'
import { useActiveWorkspace } from '../workspace/ActiveWorkspaceContext.jsx'
import { useWorkspaceTheme } from '../workspace/hooks/useWorkspaceTheme.js'
import MilestoneCreateDialog from './MilestoneCreateDialog.jsx'
import MilestoneRoad from './MilestoneRoad.jsx'
import MilestoneStepDialog from './MilestoneStepDialog.jsx'
import useMilestones from './useMilestones.js'
import './milestones.css'

const STATUS_LABELS = {
  pending: 'Pending',
  in_progress: 'In progress',
  completed: 'Completed',
}

export default function MilestonesPage() {
  const navigate = useNavigate()
  const { theme } = useWorkspaceTheme()
  const { activeWorkspace, activeWorkspaceId, isAllWorkspaces } = useActiveWorkspace()
  const workspaceId = isAllWorkspaces ? null : activeWorkspaceId
  const isOwner = activeWorkspace?.current_user_role === 'owner'

  const handleUnauthorized = useCallback(() => {
    clearSession()
    navigate('/login', { replace: true })
  }, [navigate])

  const { items, loading, error, refresh, setItems } = useMilestones({
    workspaceId,
    onUnauthorized: handleUnauthorized,
  })

  const [searchParams, setSearchParams] = useSearchParams()
  const createOpen = searchParams.get('create') === '1'
  const closeCreate = useCallback(() => {
    const next = new URLSearchParams(searchParams)
    next.delete('create')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const [selectedId, setSelectedId] = useState(null)
  const [selectedStep, setSelectedStep] = useState(null)

  const selected = items.find((item) => item.id === selectedId) || items[0] || null
  const stepIndex = selectedStep
    ? selected?.steps.findIndex((step) => step.id === selectedStep.id)
    : -1
  const currentIndex = selected?.steps.findIndex(
    (step) => step.id === selected.current_step_id,
  ) ?? -1
  const currentStep = currentIndex >= 0 ? selected.steps[currentIndex] : null

  function handleCreated(created) {
    if (created?.id) {
      setItems((current) => [...current, created])
      setSelectedId(created.id)
    }
    refresh()
  }

  return (
    <div
      className="workspace-page milestones-page mx-auto w-full max-w-[1400px]"
      data-theme={theme}
    >
      <header className="milestones-header">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Milestones</h1>
          <p className="text-[13px] text-muted-foreground">
            {activeWorkspace?.name
              ? `Roadmaps in ${activeWorkspace.name}`
              : 'Follow each roadmap from start to finish.'}
          </p>
        </div>
        <Badge variant="outline" className="text-[11px]">
          {isOwner ? 'Workspace owner' : 'Workspace member'}
        </Badge>
      </header>

      {!workspaceId ? (
        <EmptyState
          icon={Map}
          title="Select a workspace"
          description="Pick a workspace from the top bar to see its roadmaps."
          className="py-16"
        />
      ) : loading ? (
        <Card className="ws-card">
          <CardContent className="p-5">
            <LoadingState label="Loading milestones…" />
          </CardContent>
        </Card>
      ) : error ? (
        <ErrorState title="Could not load milestones" message={error} onRetry={refresh} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Flag}
          title="No milestones yet"
          description={
            isOwner
              ? 'Use “Create Milestone” under Quick Actions to build the first road.'
              : 'The workspace owner has not created a milestone yet.'
          }
          className="py-16"
        />
      ) : (
        <div className="milestones-layout">
          <Card className="ws-card milestones-list">
            <CardHeader className="px-4 pb-2 pt-4 sm:px-5 sm:pt-5">
              <CardTitle className="ws-card-title">Roadmaps</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 p-3 sm:p-4">
              {items.map((milestone) => (
                <button
                  key={milestone.id}
                  type="button"
                  className={`milestone-card${selected?.id === milestone.id ? ' is-selected' : ''}`}
                  onClick={() => setSelectedId(milestone.id)}
                  aria-pressed={selected?.id === milestone.id}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="truncate text-[13.5px] font-semibold">
                      {milestone.title}
                    </span>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {STATUS_LABELS[milestone.status] || milestone.status}
                    </Badge>
                  </span>
                  <span className="milestone-card-progress">
                    <span
                      className="milestone-card-progress-fill"
                      style={{ width: `${Math.min(Math.max(milestone.progress, 0), 100)}%` }}
                    />
                  </span>
                  <span className="flex justify-between text-[11px] text-muted-foreground">
                    <span>
                      {milestone.completed_steps}/{milestone.total_steps} steps
                    </span>
                    <span>{Math.round(milestone.progress)}%</span>
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>

          {selected && (
            <Card className="ws-card milestones-detail">
              <CardHeader className="px-5 pb-2 pt-5">
                <CardTitle className="ws-card-title">{selected.title}</CardTitle>
                <p className="text-[12.5px] text-muted-foreground">
                  {selected.completed_steps} of {selected.total_steps} steps ·{' '}
                  {selected.completed_tasks} of {selected.total_tasks} tasks done
                </p>
                {currentStep && (
                  <p className="milestone-current-label">
                    Current step {currentIndex + 1}: {currentStep.title}
                  </p>
                )}
              </CardHeader>
              <CardContent className="p-4 sm:p-5">
                <MilestoneRoad milestone={selected} onStepClick={setSelectedStep} />
                <p className="milestone-road-hint">
                  Select a step to see its description and tasks.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {isOwner && workspaceId && (
        <MilestoneCreateDialog
          open={createOpen}
          workspaceId={workspaceId}
          onClose={closeCreate}
          onCreated={handleCreated}
        />
      )}

      <MilestoneStepDialog
        open={selectedStep != null}
        step={selectedStep}
        index={stepIndex < 0 ? 0 : stepIndex}
        onClose={() => setSelectedStep(null)}
      />
    </div>
  )
}
