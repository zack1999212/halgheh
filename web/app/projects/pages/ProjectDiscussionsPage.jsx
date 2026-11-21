import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { MessageSquare, Pin, Plus, RefreshCw } from 'lucide-react'
import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import FormError from '@/components/shared/FormError'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { getCurrentUser } from '../../auth/api.js'
import {
  createProjectDiscussion,
  listProjectDiscussions,
  updateProjectDiscussion,
} from '../api.js'
import ProjectDiscussionDetail from '../components/ProjectDiscussionDetail.jsx'
import ProjectDiscussionDialog from '../components/ProjectDiscussionDialog.jsx'
import ProjectReactionBar from '../components/ProjectReactionBar.jsx'
import { formatRelativeTime } from '../utils/projectFormat.js'

const FILTERS = [
  { id: 'all', label: 'All', type: undefined },
  { id: 'announcement', label: 'Announcements', type: 'announcement' },
  { id: 'discussion', label: 'Discussions', type: 'discussion' },
]

function initials(author) {
  const src = (author?.name || author?.username || '').trim()
  if (!src) return '?'
  const parts = src.split(/\s+/).filter(Boolean).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() || '').join('') || '?'
}

function authorName(author) {
  return author?.name?.trim() || author?.username?.trim() || 'Unknown member'
}

function previewText(content, max = 180) {
  const clean = String(content || '').replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, max - 1).trimEnd()}…`
}

function canManageContent(role) {
  return role === 'owner' || role === 'admin' || role === 'editor'
}

function DiscussionCard({ discussion, onOpen }) {
  const isAnnouncement = discussion.type === 'announcement'
  const isPinned = Boolean(discussion.is_pinned)

  return (
    <button
      type="button"
      onClick={() => onOpen(discussion)}
      className={cn(
        'project-3d-card project-3d-card-interactive w-full p-5 text-left sm:p-6',
        isPinned && 'border-[#E8DDB7] bg-[#FCFAF3]',
      )}
    >
      <div className="flex items-start gap-3 sm:gap-4">
        <Avatar className="size-10 shrink-0 border border-[#E7E1D8] bg-white shadow-[0_1px_2px_rgba(25,25,25,0.04)]">
          <AvatarFallback className="bg-[#EFEAE1] text-[12px] font-semibold text-[#5F5A51]">
            {initials(discussion.author)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className="text-[13px] font-semibold text-[#191919]">{authorName(discussion.author)}</span>
            <span className="text-[12px] text-[#8A847B]">{formatRelativeTime(discussion.created_at)}</span>

            <span
              className={cn(
                'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.01em]',
                isAnnouncement
                  ? 'bg-[#FFC400] text-[#191919] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]'
                  : 'border border-[#E7E1D8] bg-white text-[#5F5A51]',
              )}
            >
              {isAnnouncement ? 'Announcement' : 'Discussion'}
            </span>

            {isPinned ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-[#E8DDB7] bg-[#FFF8DE] px-2.5 py-0.5 text-[11px] font-medium text-[#7A6200]">
                <Pin size={11} aria-hidden="true" />
                Pinned
              </span>
            ) : null}
          </div>

          <h3 className="mt-3 text-[16px] font-semibold tracking-[-0.02em] text-[#191919] sm:text-[17px]">
            {discussion.title}
          </h3>
          <p className="mt-2 max-w-4xl text-[14px] leading-relaxed text-[#6B665F]">
            {previewText(discussion.content)}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-[12.5px] font-medium text-[#8A847B]">
              {discussion.reply_count || 0} {(discussion.reply_count || 0) === 1 ? 'reply' : 'replies'}
            </span>
            <div className="min-w-0 flex-1">
              <ProjectReactionBar reactions={discussion.reactions || []} canReact={false} compact />
            </div>
          </div>
        </div>
      </div>
    </button>
  )
}

export default function ProjectDiscussionsPage() {
  const { projectId } = useParams()
  const outlet = useOutletContext() || {}
  const role = outlet.role || outlet.project?.current_user_role
  const canWrite = canManageContent(role)
  const canCreateAnnouncement = role === 'owner' || role === 'admin'

  const [currentUserId, setCurrentUserId] = useState(null)
  const [filter, setFilter] = useState('all')
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [dialog, setDialog] = useState({ open: false, mode: 'create', discussion: null, busy: false, error: '' })
  const [selectedDiscussionId, setSelectedDiscussionId] = useState(null)
  const [detailRefreshKey, setDetailRefreshKey] = useState(0)
  const offsetRef = useRef(0)
  const requestRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    getCurrentUser().then((u) => { if (!cancelled) setCurrentUserId(u?.id ?? null) }).catch((err) => {
      if (err?.status === 401) outlet.onUnauthorized?.()
    })
    return () => { cancelled = true }
  }, [outlet])

  const activeFilter = useMemo(() => FILTERS.find((f) => f.id === filter) || FILTERS[0], [filter])

  const loadDiscussions = useCallback(async ({ reset = false } = {}) => {
    if (!projectId) return
    const nextOffset = reset ? 0 : offsetRef.current
    const reqId = ++requestRef.current
    if (reset) { setLoading(true); setError('') } else { setLoadingMore(true); setError('') }
    try {
      const params = { limit: 20, offset: nextOffset }
      if (activeFilter.type) params.type = activeFilter.type
      const res = await listProjectDiscussions(projectId, params)
      if (reqId !== requestRef.current) return
      const incoming = Array.isArray(res?.items) ? res.items : []
      setTotal(Number.isFinite(res?.total) ? res.total : incoming.length)
      setItems((prev) => {
        const base = reset ? [] : prev
        const seen = new Set(base.map((d) => d.id))
        const merged = [...base]
        for (const d of incoming) {
          if (seen.has(d.id)) continue
          seen.add(d.id)
          merged.push(d)
        }
        return merged
      })
      offsetRef.current = nextOffset + incoming.length
    } catch (err) {
      if (reqId !== requestRef.current) return
      if (err?.status === 401) { outlet.onUnauthorized?.(); return }
      setError(err?.message || 'Could not load discussions.')
      if (reset) { setItems([]); setTotal(0); offsetRef.current = 0 }
    } finally {
      if (reqId === requestRef.current) { setLoading(false); setLoadingMore(false) }
    }
  }, [projectId, activeFilter.type, outlet])

  useEffect(() => {
    offsetRef.current = 0
    loadDiscussions({ reset: true })
  }, [loadDiscussions])

  const hasMore = items.length < total

  function openCreate() {
    setDialog({ open: true, mode: 'create', discussion: null, busy: false, error: '' })
  }

  function openEdit(discussion) {
    setDialog({ open: true, mode: 'edit', discussion, busy: false, error: '' })
  }

  async function handleDialogSubmit(payload) {
    setDialog((d) => ({ ...d, busy: true, error: '' }))
    try {
      if (dialog.mode === 'edit' && dialog.discussion) {
        const updated = await updateProjectDiscussion(projectId, dialog.discussion.id, payload)
        setItems((prev) => prev.map((d) => (d.id === updated.id ? { ...d, ...updated } : d)))
        if (selectedDiscussionId === updated.id) setDetailRefreshKey((k) => k + 1)
      } else {
        await createProjectDiscussion(projectId, payload)
      }
      setDialog({ open: false, mode: 'create', discussion: null, busy: false, error: '' })
      offsetRef.current = 0
      await loadDiscussions({ reset: true })
    } catch (err) {
      if (err?.status === 401) { outlet.onUnauthorized?.(); return }
      setDialog((d) => ({ ...d, busy: false, error: err?.message || 'Could not save the discussion.' }))
    }
  }

  const refreshList = useCallback(() => {
    offsetRef.current = 0
    loadDiscussions({ reset: true })
  }, [loadDiscussions])

  return (
    <div className="project-3d-page" aria-label="Project discussions">
      <section className="project-3d-panel">
        <div className="project-3d-panel-header">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <p className="project-3d-eyebrow">Project Communication</p>
              <div className="mt-2 flex items-center gap-3">
                <span className="project-3d-icon-badge" aria-hidden="true">
                  <MessageSquare size={18} strokeWidth={2.1} />
                </span>
                <h2 className="text-[28px] font-semibold tracking-[-0.03em] text-[#191919] sm:text-[32px]">
                  Discussions
                </h2>
              </div>
              <p className="mt-3 max-w-3xl text-[14px] leading-relaxed text-[#6B665F] sm:text-[15px]">
                Share announcements, start discussions, and keep project communication in one place.
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2 self-start">
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl border-[#E7E1D8] bg-white px-4 text-[#5F5A51] shadow-[0_1px_2px_rgba(25,25,25,0.03)] hover:bg-[#F7F5F1] hover:text-[#191919]"
                onClick={refreshList}
                disabled={loading}
              >
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
                Refresh
              </Button>
              {canWrite ? (
                <Button
                  type="button"
                  className="project-3d-btn-dark h-10 rounded-xl px-4"
                  onClick={openCreate}
                >
                  <Plus size={15} aria-hidden="true" />
                  New post
                </Button>
              ) : null}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Discussion filters">
            {FILTERS.map((f) => {
              const active = f.id === filter
              return (
                <button
                  key={f.id}
                  type="button"
                  className="project-3d-filter"
                  data-active={active ? 'true' : 'false'}
                  aria-pressed={active}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                </button>
              )
            })}
          </div>
        </div>
      </section>

      <section className="project-3d-panel" aria-label="Project discussions feed">
        <div className="project-3d-panel-body">
          <FormError>{actionError}</FormError>
          {loading ? (
            <div className="grid gap-3" aria-busy="true" aria-label="Loading discussions">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[156px] rounded-2xl bg-[#F0ECE4]" />)}
            </div>
          ) : error && items.length === 0 ? (
            <ErrorState message={error} onRetry={refreshList} />
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#E7E1D8] bg-[#F7F5F1] p-8">
              <EmptyState
                icon={MessageSquare}
                title={filter === 'all' ? 'No discussions yet' : `No ${filter === 'announcement' ? 'announcements' : 'discussions'} yet`}
                description={canWrite ? 'Start the conversation by creating the first post for this project.' : 'There are no posts in this view yet.'}
              />
            </div>
          ) : (
            <div className="grid gap-3">
              {items.map((d) => <DiscussionCard key={d.id} discussion={d} onOpen={(disc) => setSelectedDiscussionId(disc.id)} />)}
              {error ? <ErrorState message={error} onRetry={() => loadDiscussions({ reset: false })} /> : null}
              {loadingMore ? <div className="grid gap-3">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-[132px] rounded-2xl bg-[#F0ECE4]" />)}</div> : null}
              {hasMore ? (
                <div className="flex justify-center pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 min-w-[160px] rounded-xl border-[#E7E1D8] bg-white px-5 text-[#5F5A51] shadow-[0_1px_2px_rgba(25,25,25,0.03)] hover:bg-[#F7F5F1] hover:text-[#191919]"
                    onClick={() => loadDiscussions({ reset: false })}
                    disabled={loadingMore}
                  >
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </section>

      <ProjectDiscussionDialog
        open={dialog.open}
        mode={dialog.mode}
        discussion={dialog.discussion}
        canCreateAnnouncement={canCreateAnnouncement}
        busy={dialog.busy}
        error={dialog.error}
        onClose={() => { if (!dialog.busy) setDialog({ open: false, mode: 'create', discussion: null, busy: false, error: '' }) }}
        onSubmit={handleDialogSubmit}
      />

      <ProjectDiscussionDetail
        open={Boolean(selectedDiscussionId)}
        projectId={projectId}
        discussionId={selectedDiscussionId}
        role={role}
        currentUserId={currentUserId}
        refreshKey={detailRefreshKey}
        onUnauthorized={outlet.onUnauthorized}
        onClose={() => setSelectedDiscussionId(null)}
        onChanged={refreshList}
        onEditDiscussion={(d) => openEdit(d)}
      />
    </div>
  )
}
