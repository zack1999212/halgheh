import { useEffect, useMemo, useState } from 'react'
import { Share2, Trash2 } from 'lucide-react'
import DialogShell from '@/components/shared/DialogShell'
import FormError from '@/components/shared/FormError'
import LoadingState from '@/components/shared/LoadingState'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/toast.jsx'
import {
  listTaskWorkspaces,
  shareTaskWithWorkspace,
  unshareTaskWorkspace,
  updateTaskWorkspacePermission,
} from './api.js'
import { formatDateTime } from './utils/taskFormat.js'

const MANAGE_WORKSPACE_ROLES = new Set(['owner', 'admin', 'editor'])
const PERMISSION_OPTIONS = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'editor', label: 'Editor' },
]

function permissionLabel(value) {
  return PERMISSION_OPTIONS.find((option) => option.value === value)?.label || value || 'Viewer'
}

export default function TaskShareDialog({
  open,
  taskId,
  taskTitle,
  workspaces = [],
  contextWorkspaceId = null,
  onClose,
  onChanged,
  onUnauthorized,
}) {
  const { toast } = useToast()
  const [associations, setAssociations] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('')
  const [permission, setPermission] = useState('viewer')
  const [confirmTarget, setConfirmTarget] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  const contextParams = useMemo(
    () => (contextWorkspaceId ? { context_workspace_id: contextWorkspaceId } : {}),
    [contextWorkspaceId],
  )

  useEffect(() => {
    if (!open) return undefined
    setSelectedWorkspaceId('')
    setPermission('viewer')
    setActionError('')
    setError('')
    setConfirmTarget(null)
  }, [open, taskId])

  useEffect(() => {
    if (!open || !taskId) return undefined
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setError('')
    listTaskWorkspaces(taskId, contextParams, { signal: controller.signal })
      .then((rows) => {
        if (!active) return
        setAssociations(Array.isArray(rows) ? rows : [])
      })
      .catch((err) => {
        if (!active || err?.name === 'AbortError') return
        if (err?.status === 401) {
          onUnauthorized?.()
          return
        }
        setError(err?.message || 'Could not load shared workspaces.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [open, taskId, contextParams, reloadKey, onUnauthorized])

  const associatedIds = useMemo(
    () => new Set(associations.map((item) => item.workspace_id)),
    [associations],
  )

  const availableWorkspaces = useMemo(
    () =>
      workspaces.filter(
        (workspace) =>
          MANAGE_WORKSPACE_ROLES.has(workspace.current_user_role) &&
          !associatedIds.has(workspace.id),
      ),
    [workspaces, associatedIds],
  )

  function refresh() {
    setReloadKey((value) => value + 1)
  }

  function handleUnauthorized(err) {
    if (err?.status === 401) {
      onUnauthorized?.()
      return true
    }
    return false
  }

  async function handleShare(event) {
    event.preventDefault()
    if (busy || !selectedWorkspaceId) return
    setBusy(true)
    setActionError('')
    try {
      const result = await shareTaskWithWorkspace(
        taskId,
        selectedWorkspaceId,
        permission,
        contextParams,
      )
      const wasDuplicate = result?.attached === false
      toast({
        title: wasDuplicate ? 'Already shared' : 'Task shared',
        description: wasDuplicate
          ? 'This task is already associated with that workspace.'
          : `Shared with ${workspaces.find((ws) => ws.id === Number(selectedWorkspaceId))?.name || 'workspace'} as ${permissionLabel(permission)}.`,
      })
      setSelectedWorkspaceId('')
      setPermission('viewer')
      refresh()
      onChanged?.()
    } catch (err) {
      if (!handleUnauthorized(err)) {
        setActionError(err?.message || 'Could not share the task.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function handlePermissionChange(association, nextPermission) {
    if (busy || association.is_original || association.permission_level === nextPermission) return
    setBusy(true)
    setActionError('')
    try {
      await updateTaskWorkspacePermission(
        taskId,
        association.workspace_id,
        nextPermission,
        contextParams,
      )
      toast({
        title: 'Permission updated',
        description: `${association.workspace_name} is now ${permissionLabel(nextPermission)}.`,
      })
      refresh()
      onChanged?.()
    } catch (err) {
      if (!handleUnauthorized(err)) {
        setActionError(err?.message || 'Could not update the permission.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleUnshare() {
    if (busy || !confirmTarget) return
    setBusy(true)
    setActionError('')
    try {
      await unshareTaskWorkspace(taskId, confirmTarget.workspace_id, contextParams)
      setConfirmTarget(null)
      toast({
        title: 'Workspace removed',
        description: `The task remains in its original workspace and is no longer available in ${confirmTarget.workspace_name}.`,
      })
      refresh()
      onChanged?.()
    } catch (err) {
      if (!handleUnauthorized(err)) {
        setActionError(err?.message || 'Could not remove the shared workspace.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DialogShell
        open={open}
        contentClassName="tasks-dialog"
        title="Share task"
        description={
          taskTitle
            ? `Manage which workspaces can access “${taskTitle}”.`
            : 'Manage which workspaces can access this task.'
        }
        onClose={busy ? () => {} : onClose}
        footer={
          <Button type="button" variant="outline" className="h-9" onClick={onClose} disabled={busy}>
            Close
          </Button>
        }
      >
        <div className="grid gap-4">
          <FormError>{error || actionError}</FormError>

          {loading ? (
            <LoadingState label="Loading shared workspaces…" />
          ) : (
            <>
              <div className="grid gap-2">
                <p className="text-[13px] font-medium">Shared workspaces</p>
                {associations.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-[12.5px] text-muted-foreground">
                    This task has no workspace associations yet.
                  </p>
                ) : (
                  <ul className="grid gap-2">
                    {associations.map((association) => (
                      <li
                        key={association.workspace_id}
                        className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background/60 px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-[13px] font-medium">
                              {association.workspace_name || `Workspace #${association.workspace_id}`}
                            </span>
                            <Badge variant={association.is_original ? 'secondary' : 'outline'} className="px-1.5 py-0 text-[10.5px]">
                              {association.is_original ? 'Original' : 'Shared'}
                            </Badge>
                          </div>
                          {association.created_at ? (
                            <p className="text-[11px] text-muted-foreground">
                              Shared {formatDateTime(association.created_at)}
                            </p>
                          ) : null}
                        </div>

                        {association.is_original ? (
                          <Badge variant="outline" className="px-1.5 py-0 text-[10.5px]">
                            {permissionLabel(association.permission_level)}
                          </Badge>
                        ) : (
                          <>
                            <Select
                              value={association.permission_level || 'viewer'}
                              onValueChange={(value) => handlePermissionChange(association, value)}
                              disabled={busy}
                            >
                              <SelectTrigger
                                className="h-8 w-[110px] text-[12px]"
                                aria-label={`Permission for ${association.workspace_name}`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {PERMISSION_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-8 text-muted-foreground hover:text-destructive"
                              aria-label={`Unshare from ${association.workspace_name}`}
                              disabled={busy}
                              onClick={() => setConfirmTarget(association)}
                            >
                              <Trash2 size={14} aria-hidden="true" />
                            </Button>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <Separator />

              <form className="grid gap-3" onSubmit={handleShare}>
                <div className="flex items-center gap-1.5">
                  <Share2 size={14} aria-hidden="true" />
                  <p className="text-[13px] font-medium">Add a workspace</p>
                </div>
                {availableWorkspaces.length === 0 ? (
                  <p className="text-[12.5px] text-muted-foreground">
                    No additional workspaces are available for sharing.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_130px_auto] sm:items-end">
                    <div className="grid gap-1.5">
                      <Label htmlFor="task-share-workspace">Workspace</Label>
                      <Select
                        value={selectedWorkspaceId}
                        onValueChange={setSelectedWorkspaceId}
                        disabled={busy}
                      >
                        <SelectTrigger id="task-share-workspace" className="h-9 w-full">
                          <SelectValue placeholder="Select a workspace" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableWorkspaces.map((workspace) => (
                            <SelectItem key={workspace.id} value={String(workspace.id)}>
                              {workspace.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="task-share-permission">Permission</Label>
                      <Select value={permission} onValueChange={setPermission} disabled={busy}>
                        <SelectTrigger id="task-share-permission" className="h-9 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PERMISSION_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button type="submit" className="h-9" disabled={busy || !selectedWorkspaceId}>
                      {busy ? 'Working…' : 'Share'}
                    </Button>
                  </div>
                )}
              </form>
            </>
          )}
        </div>
      </DialogShell>

      <ConfirmDialog
        open={Boolean(confirmTarget)}
        title="Remove shared workspace?"
        description={
          confirmTarget
            ? `The task will disappear from ${confirmTarget.workspace_name}. It will remain available in its original workspace.`
            : 'The task will remain in its original workspace.'
        }
        confirmLabel="Unshare"
        busyLabel="Removing…"
        busy={busy}
        error={actionError}
        contentClassName="tasks-dialog"
        onConfirm={handleUnshare}
        onClose={() => { if (!busy) setConfirmTarget(null) }}
      />
    </>
  )
}
