import { useCallback, useEffect, useState } from 'react'
import { LogOut, Mail, UserPlus, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import DialogShell from '@/components/shared/DialogShell'
import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import LoadingState from '@/components/shared/LoadingState'
import { useToast } from '@/components/shared/ToastProvider'
import { cn } from '@/lib/utils'
import { formatDateTime } from '../../notifications/format.js'
import {
  leaveWorkspace,
  listWorkspaceInvitations,
  listWorkspaceMembers,
  revokeWorkspaceInvitation,
} from '../api.js'
import { useWorkspaceTheme } from '../hooks/useWorkspaceTheme.js'
import { InvitationStatusBadge, RoleBadge } from './InvitationBadges.jsx'
import InviteToWorkspaceDialog from './InviteToWorkspaceDialog.jsx'

function displayName(person) {
  return person?.name || person?.username || 'Unknown user'
}

function initialsOf(person) {
  const source = (person?.name || person?.username || '').trim()
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function MemberRow({ person, role, joinedAt }) {
  const username = person?.username
  return (
    <li className="ws-row group g-yellow">
      <span
        className={cn('ws-chip size-10', role === 'owner' ? 'g-ink' : 'g-gold')}
        aria-hidden="true"
      >
        <span className="text-[13px] font-semibold">{initialsOf(person)}</span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-5 text-foreground">
          {displayName(person)}
        </p>
        {username && (
          <p className="truncate text-xs text-muted-foreground">@{username}</p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <RoleBadge role={role} />
        {joinedAt && (
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            Joined {formatDateTime(joinedAt)}
          </p>
        )}
      </div>
    </li>
  )
}

function InvitationRow({ invitation, canRevoke, onRevoke }) {
  return (
    <li className="ws-row group g-yellow">
      <span className="ws-chip g-gold size-10" aria-hidden="true">
        <Mail className="ws-icon size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-5 text-foreground">
          {invitation.invitee_username || `User #${invitation.invitee_id}`}
        </p>
        <p className="text-[11.5px] text-muted-foreground">
          Sent {formatDateTime(invitation.created_at)}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        <RoleBadge role={invitation.role} />
        <InvitationStatusBadge status={invitation.status} />
        {canRevoke && invitation.status === 'pending' && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-[12px]"
            onClick={() => onRevoke(invitation)}
          >
            Revoke
          </Button>
        )}
      </div>
    </li>
  )
}

/**
 * Management surface for a shared workspace, styled to match the workspace
 * dashboard. Everyone with workspace access can view members and invitations
 * (matching the backend); only the owner sees invite/revoke controls and only
 * non-owners see "Leave workspace". The backend remains authoritative.
 */
export default function WorkspaceManageDialog({
  open,
  workspace,
  onClose,
  onLeft,
  onUnauthorized,
}) {
  const toast = useToast()
  const { theme } = useWorkspaceTheme()
  const workspaceId = workspace?.id ?? null
  const isOwner = workspace?.current_user_role === 'owner'

  const [members, setMembers] = useState([])
  const [invitations, setInvitations] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState('members') // members | invitations
  const [inviteOpen, setInviteOpen] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState(null)
  const [revokeBusy, setRevokeBusy] = useState(false)
  const [revokeError, setRevokeError] = useState('')
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [leaveBusy, setLeaveBusy] = useState(false)
  const [leaveError, setLeaveError] = useState('')

  const refresh = useCallback(
    async ({ showLoading = false } = {}) => {
      if (!workspaceId) return
      if (showLoading) setLoading(true)
      setError('')
      try {
        const [memberList, invitationList] = await Promise.all([
          listWorkspaceMembers(workspaceId),
          listWorkspaceInvitations(workspaceId),
        ])
        setMembers(Array.isArray(memberList) ? memberList : [])
        setInvitations(Array.isArray(invitationList) ? invitationList : [])
      } catch (err) {
        if (err?.status === 401) {
          onUnauthorized?.()
          return
        }
        setError(err?.message || 'Could not load workspace details.')
      } finally {
        if (showLoading) setLoading(false)
      }
    },
    [workspaceId, onUnauthorized],
  )

  // Load whenever the dialog opens (or the target workspace changes). The
  // dialog component stays mounted while closed, so `refresh` is the single
  // fetch path shared with post-action refreshes.
  useEffect(() => {
    if (open && workspaceId) {
      setView('members')
      refresh({ showLoading: true })
    }
  }, [open, workspaceId, refresh])

  async function confirmRevoke() {
    if (!revokeTarget || revokeBusy || !workspaceId) return
    setRevokeBusy(true)
    setRevokeError('')
    try {
      await revokeWorkspaceInvitation(workspaceId, revokeTarget.id)
      toast.success(`Invitation for ${revokeTarget.invitee_username || 'the user'} revoked.`)
      setRevokeTarget(null)
      refresh()
    } catch (err) {
      if (err?.status === 401) {
        onUnauthorized?.()
        return
      }
      setRevokeError(err?.message || 'Could not revoke the invitation.')
    } finally {
      setRevokeBusy(false)
    }
  }

  async function confirmLeave() {
    if (!workspaceId || leaveBusy) return
    setLeaveBusy(true)
    setLeaveError('')
    try {
      await leaveWorkspace(workspaceId)
      setLeaveOpen(false)
      toast.success('You left the workspace.')
      onLeft?.()
    } catch (err) {
      if (err?.status === 401) {
        onUnauthorized?.()
        return
      }
      setLeaveError(err?.message || 'Could not leave the workspace.')
    } finally {
      setLeaveBusy(false)
    }
  }

  const owner = workspace?.owner
  const tabClass = (active) =>
    cn(
      'flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      active
        ? 'bg-foreground text-background shadow-sm'
        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
    )

  return (
    <>
      <DialogShell
        open={open}
        wide
        theme={theme}
        contentClassName="ws-dialog-scope"
        title={workspace?.name ? `Manage “${workspace.name}”` : 'Manage workspace'}
        description="Members and invitations for this shared workspace."
        onClose={onClose}
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            {!isOwner && (
              <Button
                type="button"
                variant="outline"
                className="h-9 gap-1.5 text-destructive hover:text-destructive"
                onClick={() => {
                  setLeaveError('')
                  setLeaveOpen(true)
                }}
              >
                <LogOut className="size-4" aria-hidden="true" />
                Leave workspace
              </Button>
            )}
            <Button type="button" variant="outline" className="h-9" onClick={onClose}>
              Close
            </Button>
          </div>
        }
      >
        <div className="grid gap-4">
          <div
            role="tablist"
            aria-label="Workspace management views"
            className="flex gap-1 rounded-[var(--radius-md)] bg-muted/60 p-1"
          >
            <button
              type="button"
              role="tab"
              id="ws-manage-tab-members"
              aria-selected={view === 'members'}
              aria-controls="ws-manage-panel-members"
              onClick={() => setView('members')}
              className={tabClass(view === 'members')}
            >
              <Users className="size-4" aria-hidden="true" />
              Members
              <span className="font-normal opacity-70">{members.length + 1}</span>
            </button>
            <button
              type="button"
              role="tab"
              id="ws-manage-tab-invitations"
              aria-selected={view === 'invitations'}
              aria-controls="ws-manage-panel-invitations"
              onClick={() => setView('invitations')}
              className={tabClass(view === 'invitations')}
            >
              <Mail className="size-4" aria-hidden="true" />
              Invitations
              <span className="font-normal opacity-70">{invitations.length}</span>
            </button>
          </div>

          {loading && <LoadingState label="Loading members and invitations…" />}

          {!loading && error && (
            <ErrorState message={error} onRetry={() => refresh({ showLoading: true })} />
          )}

          {!loading && !error && view === 'members' && (
            <Card className="ws-card">
              <CardHeader className="ws-card-head px-4 pb-2 pt-4 sm:px-5 sm:pt-5">
                <CardTitle className="ws-card-title">Members</CardTitle>
                <span className="text-xs text-muted-foreground">
                  {members.length + 1} people
                </span>
              </CardHeader>
              <CardContent className="px-3 pb-4 pt-0 sm:px-4 sm:pb-5">
                <ul className="flex flex-col gap-0.5">
                  <MemberRow person={owner} role="owner" />
                  {members.map((member) => (
                    <MemberRow
                      key={member.id}
                      person={member}
                      role={member.role}
                      joinedAt={member.joined_at}
                    />
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {!loading && !error && view === 'invitations' && (
            <Card className="ws-card">
              <CardHeader className="ws-card-head px-4 pb-2 pt-4 sm:px-5 sm:pt-5">
                <CardTitle className="ws-card-title">Invitations</CardTitle>
                {isOwner && (
                  <Button
                    type="button"
                    size="sm"
                    className="ws-btn h-8 gap-1.5 rounded-[10px]"
                    onClick={() => setInviteOpen(true)}
                  >
                    <UserPlus className="size-3.5" aria-hidden="true" />
                    Invite member
                  </Button>
                )}
              </CardHeader>
              <CardContent className="px-3 pb-4 pt-0 sm:px-4 sm:pb-5">
                {invitations.length === 0 ? (
                  <EmptyState
                    className="py-6"
                    title="No invitations"
                    description={
                      isOwner
                        ? 'Invite an existing user by username to collaborate in this workspace.'
                        : 'Invitations sent from this workspace will appear here.'
                    }
                  />
                ) : (
                  <ul className="flex flex-col gap-0.5">
                    {invitations.map((invitation) => (
                      <InvitationRow
                        key={invitation.id}
                        invitation={invitation}
                        canRevoke={isOwner}
                        onRevoke={(inv) => {
                          setRevokeError('')
                          setRevokeTarget(inv)
                        }}
                      />
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </DialogShell>

      <InviteToWorkspaceDialog
        open={inviteOpen}
        workspace={workspace}
        onClose={() => setInviteOpen(false)}
        onInvited={() => refresh()}
        onUnauthorized={onUnauthorized}
      />

      <ConfirmDialog
        open={Boolean(revokeTarget)}
        title="Revoke invitation"
        description={`Revoke the invitation for ${
          revokeTarget?.invitee_username || 'this user'
        }? They will no longer be able to accept it. Existing members are not affected.`}
        confirmLabel="Revoke"
        busyLabel="Revoking…"
        destructive={false}
        busy={revokeBusy}
        error={revokeError}
        onConfirm={confirmRevoke}
        onClose={() => {
          if (revokeBusy) return
          setRevokeTarget(null)
          setRevokeError('')
        }}
      />

      <ConfirmDialog
        open={leaveOpen}
        title="Leave workspace"
        description={`Leave “${workspace?.name || 'this workspace'}”? You will lose access based on your role until you are invited again. This does not delete the workspace.`}
        confirmLabel="Leave workspace"
        busyLabel="Leaving…"
        busy={leaveBusy}
        error={leaveError}
        onConfirm={confirmLeave}
        onClose={() => {
          if (leaveBusy) return
          setLeaveOpen(false)
          setLeaveError('')
        }}
      />
    </>
  )
}