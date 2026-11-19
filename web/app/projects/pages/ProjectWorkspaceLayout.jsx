import { useCallback, useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Archive, ArchiveRestore, Menu, Pencil, Trash2 } from 'lucide-react'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import ErrorState from '@/components/shared/ErrorState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { clearToken } from '../../src/api.js'
import ProjectDialog from '../components/ProjectDialog.jsx'
import ProjectStatusBadge from '../components/ProjectStatusBadge.jsx'
import ProjectWorkspaceSidebar from '../components/ProjectWorkspaceSidebar.jsx'
import { archiveProject, deleteProject, getProject, restoreProject } from '../api.js'
import { canEditProject, isProjectOwner } from '../utils/projectConstants.js'
import { formatRole, getProjectIcon } from '../utils/projectFormat.js'
import '../projects.css'

export default function ProjectWorkspaceLayout() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [errorStatus, setErrorStatus] = useState(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [confirm, setConfirm] = useState({ open: false, action: null, busy: false, error: '' })
  const [refreshKey, setRefreshKey] = useState(0)

  const handleUnauthorized = useCallback(() => {
    clearToken()
    navigate('/login', { replace: true })
  }, [navigate])

  const load = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    setError('')
    setErrorStatus(null)
    try {
      const data = await getProject(projectId)
      setProject(data)
    } catch (err) {
      if (err?.status === 401) {
        handleUnauthorized()
        return
      }
      setErrorStatus(err?.status ?? null)
      setError(err?.message || 'Could not load the project.')
      setProject(null)
    } finally {
      setLoading(false)
    }
  }, [projectId, handleUnauthorized])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])

  const role = project?.current_user_role
  const canEdit = canEditProject(role)
  const owner = isProjectOwner(role)
  const isArchived = project?.status === 'archived'
  const Icon = getProjectIcon(project?.icon)

  const outletContext = useMemo(() => ({
    project,
    projectId,
    role,
    refreshProject: () => setRefreshKey((k) => k + 1),
    onUnauthorized: handleUnauthorized,
  }), [project, projectId, role, handleUnauthorized])

  async function handleConfirm() {
    if (!confirm.action || !project) return
    setConfirm((c) => ({ ...c, busy: true, error: '' }))
    try {
      if (confirm.action === 'archive') await archiveProject(project.id)
      if (confirm.action === 'restore') await restoreProject(project.id)
      if (confirm.action === 'delete') await deleteProject(project.id)
      setConfirm({ open: false, action: null, busy: false, error: '' })
      if (confirm.action === 'delete') {
        navigate('/projects', { replace: true })
      } else {
        setRefreshKey((k) => k + 1)
      }
    } catch (err) {
      if (err?.status === 401) {
        handleUnauthorized()
        return
      }
      setConfirm((c) => ({ ...c, busy: false, error: err?.message || 'Action failed.' }))
    }
  }

  if (loading) {
    return (
      <div className="project-workspace">
        <div className="project-workspace-shell">
          <div className="project-workspace-header p-5">
            <div className="flex items-center gap-3">
              <Skeleton className="size-11 rounded-xl bg-white/10" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-48 bg-white/10" />
                <Skeleton className="h-3 w-72 max-w-full bg-white/10" />
              </div>
            </div>
          </div>
          <div className="flex min-h-[420px]">
            <div className="hidden w-[240px] border-r border-white/10 bg-[#1B1B19] p-4 lg:block">
              <Skeleton className="mb-3 h-3 w-20 bg-white/10" />
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="mb-2 h-9 w-full bg-white/10" />)}
            </div>
            <div className="flex-1 bg-[#F2F0EB] p-6">
              <Skeleton className="h-32 w-full rounded-2xl" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !project) {
    const title = errorStatus === 404 ? 'Project not found' : 'Could not load project'
    const message = errorStatus === 404
      ? 'This project does not exist or you do not have access to it.'
      : (error || 'The project could not be loaded.')
    return (
      <div className="project-workspace">
        <div className="project-workspace-shell p-6">
          <ErrorState title={title} message={message} onRetry={errorStatus === 404 ? undefined : load} />
          <div className="mt-4">
            <Button type="button" variant="outline" onClick={() => navigate('/projects')}>Back to projects</Button>
          </div>
        </div>
      </div>
    )
  }

  const confirmTitle = confirm.action === 'delete' ? 'Delete project' : confirm.action === 'archive' ? 'Archive project' : 'Restore project'
  const confirmDescription = confirm.action === 'delete'
    ? `Delete "${project.name}"? This action cannot be undone and may remove associated project data.`
    : confirm.action === 'archive'
      ? `Archive "${project.name}"? You can restore it later.`
      : `Restore "${project.name}" to active status?`
  const confirmLabel = confirm.action === 'delete' ? 'Delete' : confirm.action === 'archive' ? 'Archive' : 'Restore'

  return (
    <div className="project-workspace">
      <div className="project-workspace-shell">
        <header className="project-workspace-header px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mt-0.5 size-9 shrink-0 text-white/70 hover:bg-white/10 hover:text-white lg:hidden"
                onClick={() => setMobileNavOpen(true)}
                aria-label="Open project navigation"
              >
                <Menu size={18} />
              </Button>
              <span
                className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/10"
                style={{ backgroundColor: project.color || '#292925', color: project.color ? '#0D0D0D' : '#FFC400' }}
                aria-hidden="true"
              >
                <Icon size={18} />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-xl font-semibold tracking-[-0.02em] text-[#F2F0EB] sm:text-2xl">{project.name}</h1>
                  <ProjectStatusBadge status={project.status} />
                  <Badge variant="outline" className="border-white/10 bg-white/[0.03] font-medium text-white/75">
                    {formatRole(role)}
                  </Badge>
                </div>
                {project.description ? (
                  <p className="mt-1.5 max-w-3xl text-[13.5px] leading-relaxed text-white/60">{project.description}</p>
                ) : (
                  <p className="mt-1.5 text-[13px] text-white/40">No project description.</p>
                )}
              </div>
            </div>

            {(canEdit || owner) && (
              <div className="flex shrink-0 items-center gap-2 pl-12 lg:pl-0">
                {canEdit && (
                  <Button type="button" variant="outline" className="h-9 border-white/15 bg-white/[0.03] text-white hover:bg-white/10 hover:text-white" onClick={() => setEditOpen(true)}>
                    <Pencil size={14} aria-hidden="true" /> Edit
                  </Button>
                )}
                {owner && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="outline" className="h-9 border-white/15 bg-white/[0.03] text-white hover:bg-white/10 hover:text-white">
                        Actions
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      {!isArchived && (
                        <DropdownMenuItem onSelect={() => setConfirm({ open: true, action: 'archive', busy: false, error: '' })}>
                          <Archive size={14} /> Archive
                        </DropdownMenuItem>
                      )}
                      {isArchived && (
                        <DropdownMenuItem onSelect={() => setConfirm({ open: true, action: 'restore', busy: false, error: '' })}>
                          <ArchiveRestore size={14} /> Restore
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfirm({ open: true, action: 'delete', busy: false, error: '' })}>
                        <Trash2 size={14} /> Delete project
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            )}
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="project-workspace-sidebar hidden w-[240px] shrink-0 lg:block">
            <ProjectWorkspaceSidebar />
          </aside>
          <main className="project-workspace-content min-w-0 flex-1 p-4 sm:p-6">
            <Outlet key={projectId ?? 'invalid'} context={outletContext} />
          </main>
        </div>
      </div>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-[280px] border-white/10 bg-[#1B1B19] p-0 text-white">
          <div className="border-b border-white/10 px-4 py-4">
            <p className="truncate text-sm font-semibold text-white">{project.name}</p>
            <p className="text-xs text-white/50">Project navigation</p>
          </div>
          <ProjectWorkspaceSidebar onNavigate={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>

      <ProjectDialog
        open={editOpen}
        mode="edit"
        project={project}
        onClose={() => setEditOpen(false)}
        onSaved={() => setRefreshKey((k) => k + 1)}
      />

      <ConfirmDialog
        open={confirm.open}
        title={confirmTitle}
        description={confirmDescription}
        confirmLabel={confirmLabel}
        busyLabel={confirm.action === 'delete' ? 'Deleting…' : 'Saving…'}
        busy={confirm.busy}
        error={confirm.error}
        destructive={confirm.action === 'delete'}
        onConfirm={handleConfirm}
        onClose={() => !confirm.busy && setConfirm({ open: false, action: null, busy: false, error: '' })}
      />
    </div>
  )
}
