import { useNavigate } from 'react-router-dom'
import { Archive, ArchiveRestore, CalendarDays, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { canEditProject, isProjectOwner } from '../utils/projectConstants.js'
import { formatProjectDate, formatRole, getProjectIcon } from '../utils/projectFormat.js'
import ProjectStatusBadge from './ProjectStatusBadge.jsx'

export default function ProjectCard({
  project,
  onEdit,
  onArchive,
  onRestore,
  onDelete,
}) {
  const navigate = useNavigate()
  if (!project) return null

  const role = project.current_user_role
  const canEdit = canEditProject(role)
  const owner = isProjectOwner(role)
  const isArchived = project.status === 'archived'
  const Icon = getProjectIcon(project.icon)
  const targetDate = formatProjectDate(project.target_date)

  function openProject() {
    navigate(`/projects/${project.id}/overview`)
  }

  function stop(e) {
    e.stopPropagation()
  }

  const hasActions = canEdit || owner

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={openProject}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openProject()
        }
      }}
      className="project-card-dark group relative flex h-full cursor-pointer flex-col p-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC400]/60"
      aria-label={`Open project ${project.name}`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
            style={{ backgroundColor: project.color || '#292925', color: project.color ? '#0D0D0D' : '#FFC400' }}
            aria-hidden="true"
          >
            <Icon size={18} />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold tracking-[-0.01em] text-[#F2F0EB]">{project.name}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <ProjectStatusBadge status={project.status} />
              <Badge variant="outline" className="border-white/10 bg-white/[0.03] font-medium text-white/75">
                {formatRole(role)}
              </Badge>
            </div>
          </div>
        </div>

        {hasActions && (
          <div onClick={stop} onKeyDown={stop} className="shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 text-white/60 hover:bg-white/10 hover:text-white data-[state=open]:bg-white/10 data-[state=open]:text-white"
                  aria-label={`Actions for ${project.name}`}
                >
                  <MoreHorizontal size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {canEdit && (
                  <DropdownMenuItem onSelect={() => onEdit?.(project)}>
                    <Pencil size={14} /> Edit project
                  </DropdownMenuItem>
                )}
                {owner && canEdit && <DropdownMenuSeparator />}
                {owner && !isArchived && (
                  <DropdownMenuItem onSelect={() => onArchive?.(project)}>
                    <Archive size={14} /> Archive
                  </DropdownMenuItem>
                )}
                {owner && isArchived && (
                  <DropdownMenuItem onSelect={() => onRestore?.(project)}>
                    <ArchiveRestore size={14} /> Restore
                  </DropdownMenuItem>
                )}
                {owner && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => onDelete?.(project)}
                    >
                      <Trash2 size={14} /> Delete project
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      <p className="line-clamp-2 min-h-[40px] text-[13px] leading-relaxed text-white/60">
        {project.description?.trim() ? project.description : 'No description provided.'}
      </p>

      <div className="mt-5 space-y-3">
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2 text-[12px]">
            <span className="text-white/55">Progress</span>
            <span className="text-white/45">Available in overview</span>
          </div>
          <div className="project-progress-track" aria-hidden="true">
            <div className="project-progress-fill" style={{ width: '0%', opacity: 0.35 }} />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-3 text-[12px] text-white/55">
          <span>Members & details in overview</span>
          {targetDate ? (
            <span className="inline-flex items-center gap-1.5 text-white/65">
              <CalendarDays size={13} aria-hidden="true" />
              {targetDate}
            </span>
          ) : (
            <span className="text-white/40">No target date</span>
          )}
        </div>
      </div>
    </article>
  )
}
