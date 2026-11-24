import { useMemo, useState } from 'react'
import { Briefcase, Check, ChevronDown, Layers, Loader2, Mail, Plus, Settings2, User } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import DialogShell from '@/components/shared/DialogShell'
import FormError from '@/components/shared/FormError'
import FormField, { fieldInputClass } from '@/components/shared/FormField'
import { cn } from '@/lib/utils'
import { useActiveWorkspace } from '../ActiveWorkspaceContext.jsx'
import { ALL_WORKSPACES } from '../constants.js'
import { createWorkspace } from '../api.js'
import WorkspaceManageDialog from './WorkspaceManageDialog.jsx'
import ReceivedInvitationsDialog from './ReceivedInvitationsDialog.jsx'

function WorkspaceIcon({ workspaceType, className }) {
  const Icon = workspaceType === 'personal' ? User : Briefcase
  return <Icon className={className} aria-hidden="true" />
}

function workspaceTypeLabel(workspaceType) {
  return workspaceType === 'personal' ? 'Personal' : 'Shared'
}

export default function WorkspaceSelector({ received, onUnauthorized }) {
  const {
    workspaces,
    status,
    error,
    workspaceScope,
    isAllWorkspaces,
    activeWorkspace,
    setWorkspaceScope,
    reload,
  } = useActiveWorkspace()

  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState('')
  const [manageOpen, setManageOpen] = useState(false)
  const [invitationsOpen, setInvitationsOpen] = useState(false)

  const canManageActive = activeWorkspace?.workspace_type === 'shared'

  const sortedWorkspaces = useMemo(() => {
    const items = Array.isArray(workspaces) ? [...workspaces] : []
    items.sort((a, b) => {
      const aPersonal = a?.workspace_type === 'personal' ? 0 : 1
      const bPersonal = b?.workspace_type === 'personal' ? 0 : 1
      if (aPersonal !== bPersonal) return aPersonal - bPersonal
      return String(a?.name || '').localeCompare(String(b?.name || ''))
    })
    return items
  }, [workspaces])

  const triggerLabel = isAllWorkspaces
    ? 'All Workspaces'
    : (activeWorkspace?.name || (status === 'loading' ? 'Loading...' : 'Workspace'))
  const triggerType = isAllWorkspaces ? 'all' : activeWorkspace?.workspace_type

  function openCreateDialog() {
    setCreateName('')
    setCreateError('')
    setCreateOpen(true)
  }

  async function handleCreateSubmit(event) {
    event.preventDefault()
    const name = createName.trim()
    if (!name || createBusy) return
    setCreateBusy(true)
    setCreateError('')
    try {
      const created = await createWorkspace({ name })
      await reload(created?.id)
      setCreateOpen(false)
      setCreateName('')
    } catch (caught) {
      setCreateError(caught?.message || 'Could not create the workspace.')
    } finally {
      setCreateBusy(false)
    }
  }

  return (
    <>
      <DropdownMenu
        onOpenChange={(next) => {
          if (next) received.refresh()
        }}
      >
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-[34px] max-w-[220px] gap-1.5 px-2.5 text-muted-foreground hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground sm:max-w-[260px]"
                  aria-label={`Active workspace: ${triggerLabel}`}
                  disabled={status === 'loading' && !activeWorkspace && !isAllWorkspaces}
                >
                  {status === 'loading' && !activeWorkspace && !isAllWorkspaces ? (
                    <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
                  ) : isAllWorkspaces ? (
                    <Layers className="size-4 shrink-0" aria-hidden="true" />
                  ) : (
                    <WorkspaceIcon
                      workspaceType={triggerType}
                      className="size-4 shrink-0"
                    />
                  )}
                  <span className="min-w-0 truncate text-sm font-medium text-foreground/90">
                    {triggerLabel}
                  </span>
                  <ChevronDown className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {isAllWorkspaces
                ? 'All Workspaces'
                : activeWorkspace
                  ? `${activeWorkspace.name} (${workspaceTypeLabel(activeWorkspace.workspace_type)})`
                  : 'Select workspace'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <DropdownMenuContent align="start" sideOffset={8} className="w-72 rounded-[var(--radius-md)] p-1.5">
          <DropdownMenuLabel className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            Workspaces
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          {status === 'loading' && sortedWorkspaces.length === 0 && (
            <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              <span>Loading workspaces...</span>
            </div>
          )}

          {status === 'error' && sortedWorkspaces.length === 0 && (
            <div className="px-2 py-2">
              <p className="text-sm text-destructive">{error || 'Could not load workspaces.'}</p>
              <button
                type="button"
                className="mt-2 text-xs font-medium text-foreground underline underline-offset-2"
                onClick={() => reload()}
              >
                Retry
              </button>
            </div>
          )}

          {status !== 'loading' && status !== 'error' && sortedWorkspaces.length === 0 && (
            <div className="px-2 py-3 text-sm text-muted-foreground">No workspaces available.</div>
          )}

          {sortedWorkspaces.length > 0 && (
            <>
              <DropdownMenuItem
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-2 text-sm',
                  isAllWorkspaces && 'bg-accent font-medium text-accent-foreground',
                )}
                onSelect={() => setWorkspaceScope(ALL_WORKSPACES)}
                aria-current={isAllWorkspaces ? 'true' : undefined}
              >
                <Layers className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="truncate">All Workspaces</div>
                  <div className="text-[11px] leading-4 text-muted-foreground">
                    All accessible workspaces
                  </div>
                </div>
                {isAllWorkspaces && <Check className="size-4 shrink-0 text-foreground" aria-hidden="true" />}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}

          {sortedWorkspaces.map((workspace) => {
            const active = workspace.id === workspaceScope
            return (
              <DropdownMenuItem
                key={workspace.id}
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-2 text-sm',
                  active && 'bg-accent font-medium text-accent-foreground',
                )}
                onSelect={() => setWorkspaceScope(workspace.id)}
                aria-current={active ? 'true' : undefined}
              >
                <WorkspaceIcon
                  workspaceType={workspace.workspace_type}
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate">{workspace.name}</div>
                  <div className="text-[11px] leading-4 text-muted-foreground">
                    {workspaceTypeLabel(workspace.workspace_type)}
                  </div>
                </div>
                {active && <Check className="size-4 shrink-0 text-foreground" aria-hidden="true" />}
              </DropdownMenuItem>
            )
          })}

          <DropdownMenuSeparator />
          {canManageActive && (
            <DropdownMenuItem
              className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-2 text-sm"
              onSelect={() => setManageOpen(true)}
            >
              <Settings2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>Manage workspace</span>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-2 text-sm"
            onSelect={() => setInvitationsOpen(true)}
          >
            <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="flex-1">Invitations</span>
            {received.pendingCount > 0 && (
              <Badge className="h-5 min-w-5 justify-center rounded-full px-1.5 text-[11px]">
                {received.pendingCount > 99 ? '99+' : received.pendingCount}
              </Badge>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-2 text-sm"
            onSelect={openCreateDialog}
          >
            <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>Create workspace</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DialogShell
        open={createOpen}
        title="Create workspace"
        description="Create a shared workspace for collaboration."
        onClose={() => {
          if (!createBusy) setCreateOpen(false)
        }}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              className="h-9"
              onClick={() => setCreateOpen(false)}
              disabled={createBusy}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="create-workspace-form"
              className="h-9"
              disabled={createBusy || !createName.trim()}
            >
              {createBusy ? 'Creating…' : 'Create'}
            </Button>
          </>
        }
      >
        <form id="create-workspace-form" className="grid gap-4" onSubmit={handleCreateSubmit}>
          <FormError>{createError}</FormError>
          <FormField id="create-workspace-name" label="Workspace name">
            {(props) => (
              <Input
                {...props}
                className={fieldInputClass}
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                placeholder="My workspace"
                maxLength={128}
                autoFocus
              />
            )}
          </FormField>
        </form>
      </DialogShell>

      <WorkspaceManageDialog
        open={manageOpen}
        workspace={activeWorkspace}
        onClose={() => setManageOpen(false)}
        onLeft={() => {
          setManageOpen(false)
          reload()
        }}
        onUnauthorized={onUnauthorized}
      />

      <ReceivedInvitationsDialog
        open={invitationsOpen}
        onClose={() => setInvitationsOpen(false)}
        items={received.items}
        loading={received.loading}
        error={received.error}
        busyId={received.busyId}
        onRefresh={() => received.refresh({ showLoading: true })}
        onAccept={received.accept}
        onDecline={received.decline}
      />
    </>
  )
}
