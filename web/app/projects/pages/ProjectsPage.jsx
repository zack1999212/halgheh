import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FolderKanban, Mail, Plus, Search } from 'lucide-react'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { clearToken } from '../../src/api.js'
import ProjectCard from '../components/ProjectCard.jsx'
import ProjectDialog from '../components/ProjectDialog.jsx'
import { archiveProject, deleteProject, listProjects, restoreProject } from '../api.js'
import '../projects.css'

const STATUS_FILTERS = [
  { id: 'all', label: 'All statuses' },
  { id: 'active', label: 'Active' },
  { id: 'on_hold', label: 'On hold' },
  { id: 'completed', label: 'Completed' },
  { id: 'archived', label: 'Archived' },
]

const SORT_OPTIONS = [
  { id: 'updated_desc', label: 'Recently updated' },
  { id: 'name_asc', label: 'Name (A–Z)' },
  { id: 'target_asc', label: 'Target date' },
  { id: 'status', label: 'Status' },
]

function sortProjects(items, sortId) {
  const list = [...items]
  if (sortId === 'name_asc') {
    list.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    return list
  }
  if (sortId === 'target_asc') {
    list.sort((a, b) => {
      const ad = a.target_date || '9999-12-31'
      const bd = b.target_date || '9999-12-31'
      if (ad !== bd) return ad.localeCompare(bd)
      return (a.name || '').localeCompare(b.name || '')
    })
    return list
  }
  if (sortId === 'status') {
    const order = { active: 0, on_hold: 1, completed: 2, archived: 3 }
    list.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || (a.name || '').localeCompare(b.name || ''))
    return list
  }
  // updated_desc default
  list.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
  return list
}

export default function ProjectsPage() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortId, setSortId] = useState('updated_desc')
  const [dialog, setDialog] = useState({ open: false, mode: 'create', project: null })
  const [confirm, setConfirm] = useState({ open: false, action: null, project: null, busy: false, error: '' })

  const handleUnauthorized = useCallback(() => {
    clearToken()
    navigate('/login', { replace: true })
  }, [navigate])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = { limit: 100, offset: 0 }
      if (statusFilter !== 'all') params.status = statusFilter
      const data = await listProjects(params)
      setProjects(Array.isArray(data?.items) ? data.items : [])
    } catch (err) {
      if (err?.status === 401) {
        handleUnauthorized()
        return
      }
      setError(err?.message || 'Could not load projects.')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, handleUnauthorized])

  useEffect(() => {
    load()
  }, [load])

  const visibleProjects = useMemo(() => {
    const q = search.trim().toLowerCase()
    let items = projects
    if (q) {
      items = items.filter((p) =>
        (p.name || '').toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q)
      )
    }
    return sortProjects(items, sortId)
  }, [projects, search, sortId])

  function openCreate() {
    setDialog({ open: true, mode: 'create', project: null })
  }

  function openEdit(project) {
    setDialog({ open: true, mode: 'edit', project })
  }

  function openConfirm(action, project) {
    setConfirm({ open: true, action, project, busy: false, error: '' })
  }

  async function handleSaved(saved, meta) {
    await load()
    if (meta?.mode === 'create' && saved?.id) {
      navigate(`/projects/${saved.id}/overview`)
    }
  }

  async function handleConfirm() {
    const { action, project } = confirm
    if (!action || !project) return
    setConfirm((c) => ({ ...c, busy: true, error: '' }))
    try {
      if (action === 'archive') await archiveProject(project.id)
      if (action === 'restore') await restoreProject(project.id)
      if (action === 'delete') await deleteProject(project.id)
      setConfirm({ open: false, action: null, project: null, busy: false, error: '' })
      await load()
    } catch (err) {
      if (err?.status === 401) {
        handleUnauthorized()
        return
      }
      setConfirm((c) => ({ ...c, busy: false, error: err?.message || 'Action failed.' }))
    }
  }

  const confirmTitle = confirm.action === 'delete'
    ? 'Delete project'
    : confirm.action === 'archive'
      ? 'Archive project'
      : 'Restore project'
  const confirmDescription = confirm.action === 'delete'
    ? `Delete "${confirm.project?.name || 'this project'}"? This action cannot be undone and may remove associated project data.`
    : confirm.action === 'archive'
      ? `Archive "${confirm.project?.name || 'this project'}"? You can restore it later.`
      : `Restore "${confirm.project?.name || 'this project'}" to active status?`
  const confirmLabel = confirm.action === 'delete' ? 'Delete' : confirm.action === 'archive' ? 'Archive' : 'Restore'

  return (
    <div className="projects-landing">
      <div className="projects-landing-surface">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="mb-2 text-[12px] font-medium uppercase tracking-[0.14em] text-[#FFC400]/90">Projects</p>
              <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[#F2F0EB] sm:text-3xl">Manage and track your work</h1>
              <p className="mt-2 text-[14px] leading-relaxed text-white/60">
                Discover your projects, monitor progress in each workspace, and keep teams aligned from one place.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button
                asChild
                type="button"
                variant="outline"
                className="h-10 gap-2 border-white/15 bg-white/[0.03] text-[#F2F0EB] hover:bg-white/10 hover:text-white"
              >
                <Link to="/projects/invitations">
                  <Mail size={16} aria-hidden="true" />
                  Invitations
                </Link>
              </Button>
              <Button
                type="button"
                onClick={openCreate}
                className="h-10 gap-2 bg-[#FFC400] text-[#0D0D0D] hover:bg-[#FFD24D]"
              >
                <Plus size={16} aria-hidden="true" />
                New project
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" aria-hidden="true" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search projects..."
                className="h-10 border-white/10 bg-[#1B1B19] pl-9 text-[#F2F0EB] placeholder:text-white/35 focus-visible:ring-[#FFC400]/40"
                aria-label="Search projects"
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-10 w-full border-white/10 bg-[#1B1B19] text-[#F2F0EB] sm:w-[170px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTERS.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sortId} onValueChange={setSortId}>
                <SelectTrigger className="h-10 w-full border-white/10 bg-[#1B1B19] text-[#F2F0EB] sm:w-[180px]">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-busy="true" aria-label="Loading projects">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="project-card-dark p-5">
                  <div className="mb-4 flex items-center gap-3">
                    <Skeleton className="size-11 rounded-xl bg-white/10" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4 bg-white/10" />
                      <Skeleton className="h-3 w-1/2 bg-white/10" />
                    </div>
                  </div>
                  <Skeleton className="h-3 w-full bg-white/10" />
                  <Skeleton className="mt-2 h-3 w-5/6 bg-white/10" />
                  <Skeleton className="mt-5 h-2 w-full rounded-full bg-white/10" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-white/10 bg-[#1B1B19] p-6">
              <ErrorState message={error} onRetry={load} />
            </div>
          ) : visibleProjects.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 bg-[#1B1B19]/60 px-6 py-14">
              <EmptyState
                icon={FolderKanban}
                title={projects.length === 0 ? 'No accessible projects' : 'No projects match your filters'}
                description={
                  projects.length === 0
                    ? 'Create your first project to start organizing work, milestones, and collaboration.'
                    : 'Try adjusting your search, status filter, or sorting.'
                }
                className="text-white [&_h3]:text-white [&_p]:text-white/60 [&_span]:bg-[#FFC400] [&_span]:text-[#0D0D0D]"
              >
                {projects.length === 0 && (
                  <Button type="button" onClick={openCreate} className="mt-2 bg-[#FFC400] text-[#0D0D0D] hover:bg-[#FFD24D]">
                    <Plus size={16} aria-hidden="true" /> Create project
                  </Button>
                )}
              </EmptyState>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {visibleProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onEdit={openEdit}
                  onArchive={(p) => openConfirm('archive', p)}
                  onRestore={(p) => openConfirm('restore', p)}
                  onDelete={(p) => openConfirm('delete', p)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <ProjectDialog
        open={dialog.open}
        mode={dialog.mode}
        project={dialog.project}
        onClose={() => setDialog({ open: false, mode: 'create', project: null })}
        onSaved={handleSaved}
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
        onClose={() => !confirm.busy && setConfirm({ open: false, action: null, project: null, busy: false, error: '' })}
      />
    </div>
  )
}
