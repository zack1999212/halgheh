import { NavLink, useParams } from 'react-router-dom'
import {
  Activity,
  CalendarDays,
  Flag,
  FolderOpen,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const ITEMS = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'tasks', label: 'Tasks', icon: ListChecks },
  { key: 'documents', label: 'Documents', icon: FolderOpen },
  { key: 'calendar', label: 'Calendar', icon: CalendarDays },
  { key: 'milestones', label: 'Milestones', icon: Flag },
  { key: 'members', label: 'Members', icon: Users },
  { key: 'discussions', label: 'Discussions', icon: MessageSquare },
  { key: 'activity', label: 'Activity', icon: Activity },
]

export default function ProjectWorkspaceSidebar({ onNavigate, className }) {
  const { projectId } = useParams()

  return (
    <nav aria-label="Project sections" className={cn('flex flex-col gap-1 p-3', className)}>
      <p className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">
        Project
      </p>
      {ITEMS.map((item) => {
        const Icon = item.icon
        const to = `/projects/${projectId}/${item.key}`
        return (
          <NavLink
            key={item.key}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn('project-workspace-nav-item', isActive && 'is-active')
            }
            end={item.key === 'overview'}
          >
            <Icon size={16} aria-hidden="true" />
            <span>{item.label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}
