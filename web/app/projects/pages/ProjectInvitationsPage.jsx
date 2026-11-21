import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, Mail, X } from 'lucide-react'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { clearToken } from '../../src/api.js'
import {
  acceptProjectInvitation,
  declineProjectInvitation,
  listReceivedProjectInvitations,
} from '../api.js'
import { formatDateTime, formatProjectDate, formatRole } from '../utils/projectFormat.js'
import '../projects.css'

function formatMaybeDate(value) {
  if (!value) return null
  if (String(value).includes('T')) return formatDateTime(value)
  return formatProjectDate(value) || String(value)
}

function inviterLabel(inv) {
  const name = inv?.inviter_name?.trim()
  const username = inv?.inviter_username?.trim()
  if (name && username && name !== username) return `${name} (@${username})`
  if (name) return name
  if (username) return `@${username}`
  return 'A project owner'
}

export default function ProjectInvitationsPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionState, setActionState] = useState({ id: null, type: null, error: '' })
  const [declineConfirm, setDeclineConfirm] = useState({ open: false, invitation: null, busy: false, error: '' })
  const [accepted, setAccepted] = useState(null)

  const handleUnauthorized = useCallback(() => {
    clearToken()
    navigate('/login', { replace: true })
  }, [navigate])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await listReceivedProjectInvitations()
      setItems(Array.isArray(res) ? res : [])
    } catch (err) {
      if (err?.status === 401) {
        handleUnauthorized()
        return
      }
      setError(err?.message || 'Could not load your project invitations.')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [handleUnauthorized])

  useEffect(() => {
    load()
  }, [load])

  const pendingInvitations = useMemo(
    () => items.filter((inv) => inv?.status === 'pending'),
    [items],
  )

  async function handleAccept(invitation) {
    if (!invitation || actionState.id) return
    setAccepted(null)
    setActionState({ id: invitation.id, type: 'accept', error: '' })
    try {
      await acceptProjectInvitation(invitation.id)
      setAccepted({ projectId: invitation.project_id, projectName: invitation.project_name || 'the project' })
      await load()
    } catch (err) {
      if (err?.status === 401) {
        handleUnauthorized()
        return
      }
      setActionState({ id: null, type: null, error: err?.message || 'Could not accept the invitation.' })
      return
    }
    setActionState({ id: null, type: null, error: '' })
  }

  function openDecline(invitation) {
    if (!invitation || actionState.id) return
    setAccepted(null)
    setActionState({ id: null, type: null, error: '' })
    setDeclineConfirm({ open: true, invitation, busy: false, error: '' })
  }

  async function handleDeclineConfirm() {
    const invitation = declineConfirm.invitation
    if (!invitation || declineConfirm.busy) return
    setDeclineConfirm((s) => ({ ...s, busy: true, error: '' }))
    setActionState({ id: invitation.id, type: 'decline', error: '' })
    try {
      await declineProjectInvitation(invitation.id)
      setDeclineConfirm({ open: false, invitation: null, busy: false, error: '' })
      await load()
      setActionState({ id: null, type: null, error: '' })
    } catch (err) {
      if (err?.status === 401) {
        handleUnauthorized()
        return
      }
      const msg = err?.message || 'Could not decline the invitation.'
      setDeclineConfirm((s) => ({ ...s, busy: false, error: msg }))
      setActionState({ id: null, type: null, error: '' })
    }
  }

  return (
    <div className="projects-landing">
      <div className="projects-landing-surface">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="-ml-2 mb-2 h-8 w-fit gap-1.5 px-2 text-white/70 hover:bg-white/10 hover:text-white"
              >
                <Link to="/projects">
                  <ArrowLeft size={14} aria-hidden="true" />
                  Back to projects
                </Link>
              </Button>
              <p className="mb-2 text-[12px] font-medium uppercase tracking-[0.14em] text-[#FFC400]/90">Projects</p>
              <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[#F2F0EB] sm:text-3xl">Project invitations</h1>
              <p className="mt-2 text-[14px] leading-relaxed text-white/60">
                Review invitations to join projects, then accept to gain access or decline if you do not want to participate.
              </p>
            </div>
          </div>

          {accepted ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-emerald-50 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[14px] font-medium">Invitation accepted</p>
                <p className="mt-0.5 text-[13px] text-emerald-100/85">You now have access to {accepted.projectName}.</p>
              </div>
              <Button asChild size="sm" className="h-9 bg-[#FFC400] text-[#0D0D0D] hover:bg-[#FFD24D]">
                <Link to={`/projects/${accepted.projectId}/overview`}>Open project</Link>
              </Button>
            </div>
          ) : null}

          {actionState.error ? (
            <div className="rounded-2xl border border-red-400/30 bg-red-400/10 p-4">
              <ErrorState message={actionState.error} />
            </div>
          ) : null}

          {loading ? (
            <div className="grid gap-3" aria-busy="true" aria-label="Loading invitations">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-white/10 bg-[#1B1B19] p-5">
                  <div className="flex items-start gap-3">
                    <Skeleton className="size-10 rounded-xl bg-white/10" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-48 bg-white/10" />
                      <Skeleton className="h-3 w-64 max-w-full bg-white/10" />
                      <Skeleton className="h-3 w-40 max-w-full bg-white/10" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-white/10 bg-[#1B1B19] p-6">
              <ErrorState message={error} onRetry={load} />
            </div>
          ) : pendingInvitations.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 bg-[#1B1B19]/60 px-6 py-14">
              <EmptyState
                icon={Mail}
                title="No pending invitations"
                description="You don't have any project invitations waiting for your response."
                className="text-white [&_h3]:text-white [&_p]:text-white/60 [&_span]:bg-[#FFC400] [&_span]:text-[#0D0D0D]"
              >
                <Button asChild variant="outline" className="mt-2 border-white/15 bg-white/[0.03] text-white hover:bg-white/10 hover:text-white">
                  <Link to="/projects">Browse projects</Link>
                </Button>
              </EmptyState>
            </div>
          ) : (
            <div className="grid gap-3">
              {pendingInvitations.map((inv) => {
                const busy = actionState.id === inv.id
                const accepting = busy && actionState.type === 'accept'
                const declining = busy && actionState.type === 'decline'
                return (
                  <article key={inv.id} className="rounded-2xl border border-white/10 bg-[#1B1B19] p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="truncate text-[16px] font-semibold tracking-[-0.01em] text-[#F2F0EB]">
                            {inv.project_name || `Project #${inv.project_id}`}
                          </h2>
                          <Badge variant="outline" className="border-[#FFC400]/30 bg-[#FFC400]/10 font-medium capitalize text-[#FFD766]">
                            {formatRole(inv.role)}
                          </Badge>
                          <Badge variant="outline" className="border-white/15 bg-white/[0.04] font-medium capitalize text-white/75">
                            {formatRole(inv.status)}
                          </Badge>
                        </div>
                        <p className="mt-1.5 text-[13.5px] text-white/65">
                          Invited by <span className="text-white/85">{inviterLabel(inv)}</span>
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-white/50">
                          {inv.created_at ? <span>Received {formatMaybeDate(inv.created_at)}</span> : null}
                          {inv.expires_at ? <span>Expires {formatMaybeDate(inv.expires_at)}</span> : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-9 gap-1.5 border-white/15 bg-white/[0.03] text-white hover:bg-white/10 hover:text-white"
                          onClick={() => openDecline(inv)}
                          disabled={busy}
                        >
                          <X size={15} aria-hidden="true" />
                          {declining ? 'Declining…' : 'Decline'}
                        </Button>
                        <Button
                          type="button"
                          className="h-9 gap-1.5 bg-[#FFC400] text-[#0D0D0D] hover:bg-[#FFD24D]"
                          onClick={() => handleAccept(inv)}
                          disabled={busy}
                        >
                          <Check size={15} aria-hidden="true" />
                          {accepting ? 'Accepting…' : 'Accept invitation'}
                        </Button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={declineConfirm.open}
        title="Decline invitation"
        description={declineConfirm.invitation ? `Decline the invitation to join ${declineConfirm.invitation.project_name || 'this project'}? You can only join later if you receive a new invitation.` : 'Decline this invitation?'}
        confirmLabel="Decline invitation"
        busyLabel="Declining…"
        busy={declineConfirm.busy}
        error={declineConfirm.error}
        destructive={false}
        onConfirm={handleDeclineConfirm}
        onClose={() => !declineConfirm.busy && setDeclineConfirm({ open: false, invitation: null, busy: false, error: '' })}
      />
    </div>
  )
}
