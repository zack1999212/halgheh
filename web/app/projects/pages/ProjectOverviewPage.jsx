import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Flag,
  ListChecks,
  Target,
  Users,
} from 'lucide-react'
import ErrorState from '@/components/shared/ErrorState'
import EmptyState from '@/components/shared/EmptyState'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { getProjectOverview, listProjectMembers } from '../api.js'
import { formatDateTime, formatProjectDate, formatRole } from '../utils/projectFormat.js'
import { PROJECT_STATUS_LABELS } from '../utils/projectConstants.js'

function ProgressBar({ value = 0, className = '' }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0))
  return (
    <div className={`h-2.5 overflow-hidden rounded-full bg-[#E5E1D9] ${className}`}>
      <div
        className="h-full rounded-full bg-[#FFC400] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)]"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function MetricCard({ icon: Icon, label, value, sub, accent = '#FFC400' }) {
  return (
    <div className="project-overview-surface p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
          <p className="project-metric-value mt-2 text-2xl font-semibold tracking-[-0.02em]">{value}</p>
          {sub ? <p className="mt-1 text-[13px] text-muted-foreground">{sub}</p> : null}
        </div>
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#E5E1D9]"
          style={{ backgroundColor: `${accent}1A`, color: accent === '#FFC400' ? '#8A6A00' : accent }}
          aria-hidden="true"
        >
          <Icon size={18} />
        </span>
      </div>
    </div>
  )
}

function BreakdownRow({ label, count, total, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-3 text-[13px]">
        <span className="flex items-center gap-2 text-foreground">
          <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
          {label}
        </span>
        <span className="text-muted-foreground">{count} <span className="text-muted-foreground/70">({pct}%)</span></span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[#EAE7E0]">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

function memberInitials(name, username, userId) {
  const source = (name || username || '').trim()
  if (source) {
    const parts = source.split(/\s+/).filter(Boolean).slice(0, 2)
    if (parts.length > 0) return parts.map((p) => p.charAt(0).toUpperCase()).join('')
  }
  if (userId != null) return String(userId).charAt(0)
  return '?'
}

function memberDisplayName(member) {
  const name = member?.name?.trim()
  if (name) return name
  const username = member?.username?.trim()
  if (username) return username
  if (member?.role === 'owner') return 'Project owner'
  return 'Unknown member'
}

function MemberRow({ member }) {
  const displayName = memberDisplayName(member)
  const initials = memberInitials(member?.name, member?.username, member?.user_id)
  const roleLabel = formatRole(member?.role)
  const username = member?.username?.trim()
  const showUsername = Boolean(username) && username !== displayName

  return (
    <li className="flex items-center gap-3 rounded-lg border border-[#E5E1D9] bg-[#F7F5F1] px-3 py-2.5">
      <Avatar className="size-8 shrink-0 border border-[#E5E1D9]">
        <AvatarFallback className="bg-[#EAE7E0] text-[11px] font-semibold tracking-[0.02em] text-[#4A463F]">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-foreground">{displayName}</p>
        {showUsername ? (
          <p className="truncate text-[12px] text-muted-foreground">@{username}</p>
        ) : null}
      </div>
      <Badge variant="outline" className="shrink-0 font-medium capitalize">
        {roleLabel}
      </Badge>
    </li>
  )
}

function MemberPreviewList({ members, loading, error, onRetry, expanded, onToggle }) {
  if (loading) {
    return (
      <ul className="mt-3 grid gap-2" aria-busy="true" aria-label="Loading members">
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i} className="flex items-center gap-3 rounded-lg border border-[#E5E1D9] bg-[#F7F5F1] px-3 py-2.5">
            <Skeleton className="size-8 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-28 max-w-full" />
              <Skeleton className="h-3 w-20 max-w-full" />
            </div>
            <Skeleton className="h-5 w-14 rounded-full" />
          </li>
        ))}
      </ul>
    )
  }

  if (error) {
    return (
      <div className="mt-3 rounded-lg border border-[#E5E1D9] bg-[#F7F5F1] p-3">
        <p className="text-[13px] font-medium text-foreground">Could not load members</p>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">{error}</p>
        {onRetry ? (
          <Button type="button" variant="outline" size="sm" className="mt-2 h-8" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </div>
    )
  }

  if (!members || members.length === 0) {
    return (
      <div className="mt-3 rounded-lg border border-dashed border-[#E5E1D9] bg-[#F7F5F1] px-3 py-4">
        <p className="text-[13px] text-muted-foreground">No members are available.</p>
      </div>
    )
  }

  const canExpand = members.length > 5
  const visible = expanded || !canExpand ? members : members.slice(0, 5)

  return (
    <div className="mt-3">
      <ul className="grid gap-2">
        {visible.map((member) => (
          <MemberRow key={member.id ?? `user-${member.user_id}-${member.role}`} member={member} />
        ))}
      </ul>
      {canExpand ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 h-8 px-2 text-[12.5px] text-muted-foreground hover:text-foreground"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          {expanded ? (
            <>
              <ChevronUp size={14} aria-hidden="true" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown size={14} aria-hidden="true" />
              Show all ({members.length})
            </>
          )}
        </Button>
      ) : null}
    </div>
  )
}

export default function ProjectOverviewPage() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const outlet = useOutletContext() || {}
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [membersData, setMembersData] = useState(null)
  const [membersLoading, setMembersLoading] = useState(true)
  const [membersError, setMembersError] = useState('')
  const [membersExpanded, setMembersExpanded] = useState(false)

  const load = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    setError('')
    try {
      const res = await getProjectOverview(projectId)
      setData(res)
    } catch (err) {
      if (err?.status === 401) {
        outlet.onUnauthorized?.()
        return
      }
      setError(err?.message || 'Could not load the project overview.')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [projectId, outlet])

  const loadMembers = useCallback(async () => {
    if (!projectId) return
    setMembersLoading(true)
    setMembersError('')
    try {
      const res = await listProjectMembers(projectId)
      setMembersData(Array.isArray(res) ? res : [])
    } catch (err) {
      if (err?.status === 401) {
        outlet.onUnauthorized?.()
        return
      }
      // Keep the rest of the overview usable if member data fails to load.
      setMembersError(err?.message || 'Could not load project members.')
      setMembersData(null)
    } finally {
      setMembersLoading(false)
    }
  }, [projectId, outlet])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    setMembersExpanded(false)
    loadMembers()
  }, [loadMembers])

  const displayMembers = useMemo(() => {
    const ownerId = data?.project?.owner_id
    const list = Array.isArray(membersData) ? [...membersData] : []
    if (ownerId == null) return list
    const hasOwner = list.some((m) => m?.user_id === ownerId || m?.role === 'owner')
    if (hasOwner) return list
    return [
      {
        id: `owner-${ownerId}`,
        project_id: data?.project?.id ?? null,
        user_id: ownerId,
        role: 'owner',
        joined_at: null,
        created_at: null,
        updated_at: null,
        username: null,
        name: null,
      },
      ...list,
    ]
  }, [data, membersData])

  if (loading) {
    return (
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-4">
          <Skeleton className="h-36 w-full rounded-2xl" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
          </div>
          <Skeleton className="h-64 w-full rounded-2xl" />
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-56 rounded-2xl" />
            <Skeleton className="h-56 rounded-2xl" />
          </div>
        </div>
        <Skeleton className="hidden h-80 rounded-2xl xl:block" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="project-overview-surface p-6">
        <ErrorState message={error || 'Could not load the project overview.'} onRetry={load} />
      </div>
    )
  }

  const { project, current_user_role: role, progress, milestones, members, upcoming_events: upcomingEvents } = data
  const taskStats = progress?.tasks || { total: 0, completed: 0, in_progress: 0, pending: 0, other: 0 }
  const pct = typeof progress?.percentage === 'number' ? progress.percentage : 0
  const upcomingMilestones = Array.isArray(milestones?.upcoming) ? milestones.upcoming : []
  const events = Array.isArray(upcomingEvents) ? upcomingEvents : []

  const breakdown = [
    { key: 'completed', label: 'Completed', count: taskStats.completed || 0, color: '#39B980' },
    { key: 'in_progress', label: 'In progress', count: taskStats.in_progress || 0, color: '#4D8DFF' },
    { key: 'pending', label: 'Pending', count: taskStats.pending || 0, color: '#FFC400' },
    { key: 'other', label: 'Other', count: taskStats.other || 0, color: '#A78BFA' },
  ]

  const milestoneSummary = `${milestones?.completed || 0} completed · ${milestones?.in_progress || 0} in progress · ${milestones?.pending || 0} pending`

  function eventTime(e) {
    if (e.is_all_day) {
      const d = e.start_date || e.end_date
      return d ? formatProjectDate(d) : 'All day'
    }
    return formatDateTime(e.start_at)
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid gap-4 min-w-0">
        <section className="project-overview-surface p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-[12px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Project overview</p>
              <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-foreground sm:text-2xl">{project?.name}</h2>
              <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-muted-foreground">
                {project?.description?.trim() ? project.description : 'No project description provided.'}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="font-medium">{PROJECT_STATUS_LABELS[project?.status] || project?.status || 'Unknown'}</Badge>
                <Badge variant="outline" className="font-medium">{formatRole(role)}</Badge>
                {project?.start_date && <span className="text-[12.5px] text-muted-foreground">Start: {formatProjectDate(project.start_date)}</span>}
                {project?.target_date && <span className="text-[12.5px] text-muted-foreground">Target: {formatProjectDate(project.target_date)}</span>}
              </div>
            </div>
            <div className="w-full max-w-sm shrink-0 rounded-xl border border-[#E5E1D9] bg-[#F7F5F1] p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-medium text-foreground">Overall progress</span>
                <span className="text-[13px] font-semibold text-foreground">{pct}%</span>
              </div>
              <ProgressBar value={pct} className="mt-3 h-3" />
              <p className="mt-2 text-[12.5px] text-muted-foreground">
                {taskStats.completed || 0} of {taskStats.total || 0} eligible tasks completed
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Project metrics">
          <MetricCard
            icon={Target}
            label="Task progress"
            value={`${pct}%`}
            sub={`${taskStats.completed || 0} / ${taskStats.total || 0} tasks`}
            accent="#FFC400"
          />
          <MetricCard
            icon={ListChecks}
            label="Tasks"
            value={taskStats.total || 0}
            sub={`${taskStats.in_progress || 0} in progress · ${taskStats.pending || 0} pending`}
            accent="#4D8DFF"
          />
          <MetricCard
            icon={Users}
            label="Members"
            value={members?.total_members || 0}
            sub={`${members?.admin || 0} admins · ${members?.editor || 0} editors · ${members?.viewer || 0} viewers`}
            accent="#39B980"
          />
          <MetricCard
            icon={Flag}
            label="Milestones"
            value={milestones?.total || 0}
            sub={milestoneSummary}
            accent="#A78BFA"
          />
        </section>

        <section className="project-overview-surface p-5 sm:p-6" aria-label="Task status breakdown">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">Task status breakdown</h3>
              <p className="mt-0.5 text-[13px] text-muted-foreground">Based on eligible project tasks calculated by the backend.</p>
            </div>
            <Badge variant="secondary" className="font-medium">{taskStats.total || 0} total</Badge>
          </div>
          {taskStats.total === 0 ? (
            <div className="rounded-xl border border-dashed border-[#E5E1D9] bg-[#F7F5F1] p-6">
              <EmptyState
                icon={CheckCircle2}
                title="No available task metrics"
                description="This project has no eligible tasks yet. Progress and task status metrics will appear here once tasks are added."
              />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {breakdown.map((row) => (
                <BreakdownRow key={row.key} label={row.label} count={row.count} total={taskStats.total || 0} color={row.color} />
              ))}
            </div>
          )}
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="project-overview-surface p-5 sm:p-6" aria-label="Upcoming milestones">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">Milestone progression</h3>
                <p className="mt-0.5 text-[13px] text-muted-foreground">Current roadmap progress and the next step to complete (from backend).</p>
              </div>
              <Button asChild variant="outline" size="sm" className="h-8">
                <Link to={`/projects/${projectId}/milestones`}>View roadmap</Link>
              </Button>
            </div>
            {(() => {
              const currentMilestone = upcomingMilestones.find((m) => m.status === 'in_progress')
                || upcomingMilestones.find((m) => (m.completed_steps || 0) > 0 && (m.completed_steps || 0) < (m.total_steps || 0))
                || upcomingMilestones[0]
                || null
              if (!currentMilestone) {
                return (
                  <div className="rounded-xl border border-dashed border-[#E5E1D9] bg-[#F7F5F1] p-5">
                    <EmptyState
                      icon={Flag}
                      title="No upcoming milestones"
                      description="There are no upcoming milestones with target dates right now. Open the roadmap to review all milestones and step progression."
                    />
                    <div className="mt-3 flex justify-center">
                      <Button asChild variant="outline" size="sm" className="h-8">
                        <Link to={`/projects/${projectId}/milestones`}>Open milestones</Link>
                      </Button>
                    </div>
                  </div>
                )
              }
              const progressValue = Number(currentMilestone.progress || 0)
              const totalSteps = currentMilestone.total_steps || 0
              const completedSteps = currentMilestone.completed_steps || 0
              const currentStepLabel = currentMilestone.next_incomplete_step
                || (totalSteps > 0 && completedSteps === totalSteps ? 'All steps completed' : 'No steps defined yet')
              return (
                <div className="grid gap-3">
                  <Link
                    to={`/projects/${projectId}/milestones`}
                    className="block rounded-xl border border-[#E5D28A] bg-[#FFF9E8] p-4 transition-colors hover:border-[#DCC45F] hover:bg-[#FFF6D8]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8A6A00]">Current milestone</p>
                        <p className="mt-1 truncate text-[15px] font-semibold text-[#242321]">{currentMilestone.title}</p>
                        <p className="mt-1 text-[12.5px] text-[#5F5A51]">
                          {currentMilestone.due_date ? `Target ${formatProjectDate(currentMilestone.due_date)} · ` : ''}{completedSteps}/{totalSteps} steps completed
                        </p>
                      </div>
                      <Badge variant="outline" className="border-[#E5D28A] bg-white/70 font-semibold text-[#6F5600]">{progressValue}%</Badge>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#EADFAF]">
                      <div className="h-full rounded-full bg-[#FFC400]" style={{ width: `${Math.max(0, Math.min(100, progressValue))}%` }} />
                    </div>
                    <p className="mt-3 text-[13px] text-[#3E3A33]">
                      <span className="font-semibold text-[#8A6A00]">Current step:</span> {currentStepLabel}
                    </p>
                  </Link>

                  {upcomingMilestones.length > 1 ? (
                    <div className="grid gap-2">
                      <p className="px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#8A857C]">Upcoming milestones</p>
                      <ul className="grid gap-2">
                        {upcomingMilestones.filter((m) => m.id !== currentMilestone.id).slice(0, 4).map((m) => {
                          const p = Number(m.progress || 0)
                          const total = m.total_steps || 0
                          const done = m.completed_steps || 0
                          return (
                            <li key={m.id}>
                              <Link to={`/projects/${projectId}/milestones`} className="block rounded-xl border border-[#E5E1D9] bg-[#F7F5F1] px-3 py-2.5 transition-colors hover:border-[#D8D2C6] hover:bg-[#F2F0EB]">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="truncate text-[13.5px] font-medium text-foreground">{m.title}</p>
                                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                                      {m.due_date ? `Target ${formatProjectDate(m.due_date)} · ` : ''}{done}/{total} steps · {p}%
                                    </p>
                                    {m.next_incomplete_step ? <p className="mt-1 text-[12px] text-foreground/80"><span className="font-medium text-[#8A6A00]">Next:</span> {m.next_incomplete_step}</p> : null}
                                  </div>
                                  <Badge variant="outline" className="shrink-0 font-medium">{p}%</Badge>
                                </div>
                              </Link>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ) : null}
                </div>
              )
            })()}
          </section>

          <section className="project-overview-surface p-5 sm:p-6" aria-label="Upcoming project events">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">Upcoming events</h3>
                <p className="mt-0.5 text-[13px] text-muted-foreground">Upcoming project calendar occurrences.</p>
              </div>
              <Button asChild variant="outline" size="sm" className="h-8">
                <Link to={`/projects/${projectId}/calendar`}>Calendar</Link>
              </Button>
            </div>
            {events.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#E5E1D9] bg-[#F7F5F1] p-5">
                <EmptyState
                  icon={CalendarDays}
                  title="No upcoming events"
                  description="There are no upcoming project calendar events."
                />
              </div>
            ) : (
              <ul className="grid gap-3">
                {events.map((e, idx) => (
                  <li key={`${e.event_id}-${e.original_start_at || e.original_start_date || e.start_at || e.start_date || idx}`} className="flex items-start gap-3 rounded-xl border border-[#E5E1D9] bg-[#F7F5F1] p-3">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#4D8DFF]/12 text-[#2F63C7]" aria-hidden="true">
                      {e.is_all_day ? <CalendarDays size={15} /> : <Clock3 size={15} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium text-foreground">{e.title}</p>
                      <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                        {eventTime(e)}
                        {e.is_all_day ? ' · All day' : ''}
                        {e.is_recurring ? ' · Recurring' : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="project-overview-surface p-5 sm:p-6 xl:hidden" aria-label="Project information">
          <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">Project information</h3>
          <dl className="mt-4 grid gap-3 text-[13.5px] sm:grid-cols-2">
            <div><dt className="text-muted-foreground">Status</dt><dd className="font-medium text-foreground">{PROJECT_STATUS_LABELS[project?.status] || project?.status || '—'}</dd></div>
            <div><dt className="text-muted-foreground">Your role</dt><dd className="font-medium text-foreground">{formatRole(role)}</dd></div>
            <div><dt className="text-muted-foreground">Start date</dt><dd className="font-medium text-foreground">{formatProjectDate(project?.start_date) || '—'}</dd></div>
            <div><dt className="text-muted-foreground">Target date</dt><dd className="font-medium text-foreground">{formatProjectDate(project?.target_date) || '—'}</dd></div>
          </dl>
          <div className="mt-5 border-t border-[#E5E1D9] pt-4">
            <h4 className="text-[13px] font-semibold tracking-[-0.01em] text-foreground">Member summary</h4>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              Total: <span className="font-medium text-foreground">{members?.total_members || 0}</span>
              <span className="text-muted-foreground/80"> · Owner {members?.owner || 0} · Admin {members?.admin || 0} · Editor {members?.editor || 0} · Viewer {members?.viewer || 0}</span>
            </p>
            <MemberPreviewList
              members={displayMembers}
              loading={membersLoading}
              error={membersError}
              onRetry={loadMembers}
              expanded={membersExpanded}
              onToggle={() => setMembersExpanded((v) => !v)}
            />
          </div>
        </section>
      </div>

      <aside className="hidden xl:block" aria-label="Project context">
        <div className="project-overview-surface sticky top-4 p-5">
          <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-foreground">Project information</h3>
          <dl className="mt-4 grid gap-4 text-[13px]">
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="mt-1 font-medium text-foreground">{PROJECT_STATUS_LABELS[project?.status] || project?.status || '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Your role</dt>
              <dd className="mt-1 font-medium text-foreground">{formatRole(role)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Start date</dt>
              <dd className="mt-1 font-medium text-foreground">{formatProjectDate(project?.start_date) || '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Target date</dt>
              <dd className="mt-1 font-medium text-foreground">{formatProjectDate(project?.target_date) || '—'}</dd>
            </div>
            <div className="border-t border-[#E5E1D9] pt-4">
              <dt className="text-muted-foreground">Member summary</dt>
              <dd className="mt-2 text-foreground">
                <div className="grid gap-1.5">
                  <span>Total: <strong>{members?.total_members || 0}</strong></span>
                  <span className="text-muted-foreground">Owner {members?.owner || 0} · Admin {members?.admin || 0} · Editor {members?.editor || 0} · Viewer {members?.viewer || 0}</span>
                </div>
                <MemberPreviewList
                  members={displayMembers}
                  loading={membersLoading}
                  error={membersError}
                  onRetry={loadMembers}
                  expanded={membersExpanded}
                  onToggle={() => setMembersExpanded((v) => !v)}
                />
              </dd>
            </div>
          </dl>
        </div>
      </aside>
    </div>
  )
}
