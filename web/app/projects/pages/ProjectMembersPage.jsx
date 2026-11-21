import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import {
  Mail,
  MoreHorizontal,
  Shield,
  Trash2,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import DialogShell from '@/components/shared/DialogShell'
import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import FormError from '@/components/shared/FormError'
import FormField, { fieldInputClass } from '@/components/shared/FormField'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  createProjectInvitation,
  listProjectInvitations,
  listProjectMembers,
  removeProjectMember,
  revokeProjectInvitation,
  updateProjectMemberRole,
} from '../api.js'
import { formatDateTime, formatProjectDate, formatRole } from '../utils/projectFormat.js'

const INVITATION_ROLES = [
  { id: 'admin', label: 'Admin' },
  { id: 'editor', label: 'Editor' },
  { id: 'viewer', label: 'Viewer' },
]

function initialsFor(name, username, userId) {
  const source = (name || username || '').trim()
  if (source) {
    const parts = source.split(/\s+/).filter(Boolean).slice(0, 2)
    if (parts.length > 0) return parts.map((p) => p.charAt(0).toUpperCase()).join('')
  }
  if (userId != null) return String(userId).charAt(0)
  return '?'
}

function displayNameFor({ name, username, role, userId }) {
  const n = name?.trim()
  if (n) return n
  const u = username?.trim()
  if (u) return u
  if (role === 'owner') return 'Project owner'
  if (userId != null) return `User ${userId}`
  return 'Unknown member'
}

function roleBadgeClass(role) {
  switch (role) {
    case 'owner':
      return 'border-[#FFC400]/40 bg-[#FFC400]/15 text-[#8A6A00]'
    case 'admin':
      return 'border-[#4D8DFF]/30 bg-[#4D8DFF]/10 text-[#2F63C7]'
    case 'editor':
      return 'border-[#39B980]/30 bg-[#39B980]/10 text-[#1E7A55]'
    case 'viewer':
      return 'border-[#A78BFA]/30 bg-[#A78BFA]/10 text-[#6D4BC3]'
    default:
      return ''
  }
}

function formatMaybeDate(value) {
  if (!value) return null
  // joined_at/created_at/expires_at may be ISO datetime; show date+time for datetimes
  if (String(value).includes('T')) return formatDateTime(value)
  return formatProjectDate(value) || String(value)
}

function SectionState({ loading, error, onRetry, loadingLabel, children }) {
  if (loading) {
    return (
      <div className="grid gap-3" aria-busy="true" aria-label={loadingLabel || 'Loading'}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-[#E5E1D9] bg-[#F7F5F1] p-4">
            <Skeleton className="size-10 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-40 max-w-full" />
              <Skeleton className="h-3 w-28 max-w-full" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        ))}
      </div>
    )
  }
  if (error) {
    return <ErrorState message={error} onRetry={onRetry} />
  }
  return children
}

export default function ProjectMembersPage() {
  const { projectId } = useParams()
  const outlet = useOutletContext() || {}
  const project = outlet.project
  const currentRole = outlet.role || project?.current_user_role
  const isOwner = currentRole === 'owner'

  const [members, setMembers] = useState([])
  const [membersLoading, setMembersLoading] = useState(true)
  const [membersError, setMembersError] = useState('')

  const [invitations, setInvitations] = useState([])
  const [invitationsLoading, setInvitationsLoading] = useState(false)
  const [invitationsError, setInvitationsError] = useState('')

  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteUsername, setInviteUsername] = useState('')
  const [inviteRole, setInviteRole] = useState('viewer')
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteFieldErrors, setInviteFieldErrors] = useState({})
  const [inviteSuccess, setInviteSuccess] = useState('')

  const [roleDialog, setRoleDialog] = useState({ open: false, member: null, role: 'viewer', busy: false, error: '' })
  const [removeDialog, setRemoveDialog] = useState({ open: false, member: null, busy: false, error: '' })
  const [revokeDialog, setRevokeDialog] = useState({ open: false, invitation: null, busy: false, error: '' })

  const loadMembers = useCallback(async () => {
    if (!projectId) return
    setMembersLoading(true)
    setMembersError('')
    try {
      const res = await listProjectMembers(projectId)
      setMembers(Array.isArray(res) ? res : [])
    } catch (err) {
      if (err?.status === 401) {
        outlet.onUnauthorized?.()
        return
      }
      setMembersError(err?.message || 'Could not load project members.')
      setMembers([])
    } finally {
      setMembersLoading(false)
    }
  }, [projectId, outlet])

  const loadInvitations = useCallback(async () => {
    if (!projectId || !isOwner) {
      setInvitations([])
      setInvitationsError('')
      setInvitationsLoading(false)
      return
    }
    setInvitationsLoading(true)
    setInvitationsError('')
    try {
      const res = await listProjectInvitations(projectId)
      setInvitations(Array.isArray(res) ? res : [])
    } catch (err) {
      if (err?.status === 401) {
        outlet.onUnauthorized?.()
        return
      }
      if (err?.status === 403 || err?.status === 404) {
        // Do not expose unauthorized project info; treat as unavailable for this role/context.
        setInvitations([])
        setInvitationsError(err?.message || 'Could not load project invitations.')
      } else {
        setInvitationsError(err?.message || 'Could not load project invitations.')
        setInvitations([])
      }
    } finally {
      setInvitationsLoading(false)
    }
  }, [projectId, isOwner, outlet])

  useEffect(() => {
    loadMembers()
  }, [loadMembers])

  useEffect(() => {
    loadInvitations()
  }, [loadInvitations])

  const ownerMember = useMemo(() => {
    if (!project) return null
    // Owner is represented by project.owner_id (no ProjectMember record). Use available info only.
    return {
      id: `owner-${project.owner_id}`,
      project_id: project.id,
      user_id: project.owner_id,
      role: 'owner',
      joined_at: null,
      created_at: null,
      updated_at: null,
      username: null,
      name: null,
      isOwner: true,
    }
  }, [project])

  const acceptedMembers = useMemo(() => {
    const list = Array.isArray(members) ? members : []
    // Ensure owner appears exactly once (members endpoint returns non-owner records).
    const withoutOwner = list.filter((m) => m?.user_id !== project?.owner_id && m?.role !== 'owner')
    return ownerMember ? [ownerMember, ...withoutOwner] : withoutOwner
  }, [members, ownerMember, project?.owner_id])

  const pendingInvitations = useMemo(
    () => (Array.isArray(invitations) ? invitations.filter((inv) => inv?.status === 'pending') : []),
    [invitations],
  )

  const totalMemberCount = acceptedMembers.length

  function resetInviteForm() {
    setInviteUsername('')
    setInviteRole('viewer')
    setInviteError('')
    setInviteFieldErrors({})
  }

  function openInvite() {
    setInviteSuccess('')
    resetInviteForm()
    setInviteOpen(true)
  }

  async function handleInviteSubmit(e) {
    e.preventDefault()
    if (inviteBusy) return
    setInviteSuccess('')
    setInviteError('')
    const trimmed = inviteUsername.trim()
    const errs = {}
    if (!trimmed) errs.username = 'Username is required.'
    if (!inviteRole) errs.role = 'Role is required.'
    setInviteFieldErrors(errs)
    if (Object.keys(errs).length > 0) return

    setInviteBusy(true)
    try {
      await createProjectInvitation(projectId, { username: trimmed, role: inviteRole })
      setInviteOpen(false)
      resetInviteForm()
      setInviteSuccess(`Invitation sent to ${trimmed}.`)
      await loadInvitations()
    } catch (err) {
      if (err?.status === 401) {
        outlet.onUnauthorized?.()
        return
      }
      setInviteError(err?.message || 'Could not send the invitation.')
    } finally {
      setInviteBusy(false)
    }
  }

  function openRoleDialog(member) {
    if (!member || member.isOwner) return
    setRoleDialog({ open: true, member, role: member.role || 'viewer', busy: false, error: '' })
  }

  async function handleRoleSave() {
    const member = roleDialog.member
    if (!member || roleDialog.busy) return
    const nextRole = roleDialog.role
    if (!nextRole || nextRole === member.role) {
      setRoleDialog({ open: false, member: null, role: 'viewer', busy: false, error: '' })
      return
    }
    setRoleDialog((s) => ({ ...s, busy: true, error: '' }))
    try {
      await updateProjectMemberRole(projectId, member.id, { role: nextRole })
      setRoleDialog({ open: false, member: null, role: 'viewer', busy: false, error: '' })
      await loadMembers()
    } catch (err) {
      if (err?.status === 401) {
        outlet.onUnauthorized?.()
        return
      }
      setRoleDialog((s) => ({ ...s, busy: false, error: err?.message || 'Could not update the member role.' }))
    }
  }

  function openRemoveDialog(member) {
    if (!member || member.isOwner) return
    setRemoveDialog({ open: true, member, busy: false, error: '' })
  }

  async function handleRemoveConfirm() {
    const member = removeDialog.member
    if (!member || removeDialog.busy) return
    setRemoveDialog((s) => ({ ...s, busy: true, error: '' }))
    try {
      await removeProjectMember(projectId, member.id)
      setRemoveDialog({ open: false, member: null, busy: false, error: '' })
      await loadMembers()
    } catch (err) {
      if (err?.status === 401) {
        outlet.onUnauthorized?.()
        return
      }
      setRemoveDialog((s) => ({ ...s, busy: false, error: err?.message || 'Could not remove the project member.' }))
    }
  }

  function openRevokeDialog(invitation) {
    if (!invitation) return
    setRevokeDialog({ open: true, invitation, busy: false, error: '' })
  }

  async function handleRevokeConfirm() {
    const inv = revokeDialog.invitation
    if (!inv || revokeDialog.busy) return
    setRevokeDialog((s) => ({ ...s, busy: true, error: '' }))
    try {
      await revokeProjectInvitation(projectId, inv.id)
      setRevokeDialog({ open: false, invitation: null, busy: false, error: '' })
      await loadInvitations()
    } catch (err) {
      if (err?.status === 401) {
        outlet.onUnauthorized?.()
        return
      }
      setRevokeDialog((s) => ({ ...s, busy: false, error: err?.message || 'Could not revoke the invitation.' }))
    }
  }

  const canManageMembers = isOwner

  return (
    <div className="grid gap-4">
      <Card className="project-overview-surface border-[#E5E1D9] shadow-none">
        <CardHeader className="gap-4 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-[20px] font-semibold tracking-[-0.02em] text-foreground">Members</CardTitle>
                <Badge variant="secondary" className="font-medium">{totalMemberCount} total</Badge>
              </div>
              <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
                Manage who has access to this project, review pending invitations, and keep roles aligned with each collaborator&apos;s responsibilities.
              </p>
            </div>
            {isOwner && (
              <div className="flex shrink-0 items-center gap-2">
                <Button type="button" className="h-9 gap-2" onClick={openInvite}>
                  <UserPlus size={15} aria-hidden="true" />
                  Invite Member
                </Button>
              </div>
            )}
          </div>
          {inviteSuccess ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
              {inviteSuccess}
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="p-5 pt-0 sm:p-6 sm:pt-0">
          <SectionState
            loading={membersLoading}
            error={membersError}
            onRetry={loadMembers}
            loadingLabel="Loading members"
          >
            {acceptedMembers.length <= 1 ? (
              <div className="grid gap-4">
                {ownerMember ? (
                  <div className="grid gap-3">
                    <MemberRow
                      member={ownerMember}
                      canManage={false}
                      onChangeRole={() => {}}
                      onRemove={() => {}}
                    />
                  </div>
                ) : null}
                <div className="rounded-xl border border-dashed border-[#E5E1D9] bg-[#F7F5F1] p-6">
                  <EmptyState
                    icon={Users}
                    title={isOwner ? 'No other members have joined yet' : 'No other members yet'}
                    description={
                      isOwner
                        ? 'Invite collaborators by username to give them access to this project.'
                        : 'Only the project owner and you currently have access context for this project.'
                    }
                  >
                    {isOwner ? (
                      <Button type="button" className="mt-2 h-9 gap-2" onClick={openInvite}>
                        <UserPlus size={15} aria-hidden="true" />
                        Invite Member
                      </Button>
                    ) : null}
                  </EmptyState>
                </div>
              </div>
            ) : (
              <div className="grid gap-3">
                {acceptedMembers.map((member) => (
                  <MemberRow
                    key={member.id ?? `member-${member.user_id}`}
                    member={member}
                    canManage={canManageMembers && !member.isOwner}
                    onChangeRole={() => openRoleDialog(member)}
                    onRemove={() => openRemoveDialog(member)}
                  />
                ))}
              </div>
            )}
          </SectionState>
        </CardContent>
      </Card>

      {isOwner && (
        <Card className="project-overview-surface border-[#E5E1D9] shadow-none">
          <CardHeader className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-[16px] font-semibold tracking-[-0.01em] text-foreground">Pending invitations</CardTitle>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Invitations sent for this project that are awaiting a response.
                </p>
              </div>
              <Badge variant="outline" className="font-medium">{pendingInvitations.length} pending</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-0 sm:p-6 sm:pt-0">
            <SectionState
              loading={invitationsLoading}
              error={invitationsError}
              onRetry={loadInvitations}
              loadingLabel="Loading invitations"
            >
              {pendingInvitations.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#E5E1D9] bg-[#F7F5F1] p-6">
                  <EmptyState
                    icon={Mail}
                    title="No pending invitations"
                    description="When you invite an existing Halgheh user to this project, their pending invitation will appear here."
                  />
                </div>
              ) : (
                <div className="grid gap-3">
                  {pendingInvitations.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex flex-col gap-3 rounded-xl border border-[#E5E1D9] bg-[#F7F5F1] p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-[13.5px] font-medium text-foreground">{inv.invitee_username || `User ${inv.invitee_id}`}</p>
                          <Badge variant="outline" className={cn('font-medium capitalize', roleBadgeClass(inv.role))}>
                            {formatRole(inv.role)}
                          </Badge>
                          <Badge variant="secondary" className="font-medium capitalize">{formatRole(inv.status)}</Badge>
                        </div>
                        <p className="mt-1 text-[12.5px] text-muted-foreground">
                          {inv.created_at ? `Invited ${formatMaybeDate(inv.created_at)}` : 'Invitation sent'}
                          {inv.expires_at ? ` · Expires ${formatMaybeDate(inv.expires_at)}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => openRevokeDialog(inv)}
                        >
                          <XCircle size={14} aria-hidden="true" />
                          Revoke
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionState>
          </CardContent>
        </Card>
      )}

      <DialogShell
        open={inviteOpen}
        title="Invite member"
        description="Invite an existing Halgheh user to collaborate on this project."
        onClose={inviteBusy ? () => {} : () => { setInviteOpen(false); setInviteError(''); }}
        footer={
          <>
            <Button type="button" variant="outline" className="h-9" onClick={() => { setInviteOpen(false); setInviteError('') }} disabled={inviteBusy}>
              Cancel
            </Button>
            <Button type="submit" form="invite-member-form" className="h-9" disabled={inviteBusy}>
              {inviteBusy ? 'Sending…' : 'Send invitation'}
            </Button>
          </>
        }
      >
        <form id="invite-member-form" className="grid gap-4" onSubmit={handleInviteSubmit}>
          <FormError>{inviteError}</FormError>
          <FormField id="invite-username" label="Username" error={inviteFieldErrors.username}>
            {(field) => (
              <Input
                {...field}
                className={cn(fieldInputClass, inviteFieldErrors.username && 'border-destructive/40 focus-visible:ring-destructive/30')}
                value={inviteUsername}
                onChange={(e) => {
                  setInviteUsername(e.target.value)
                  setInviteFieldErrors((s) => ({ ...s, username: '' }))
                }}
                placeholder="Enter username"
                disabled={inviteBusy}
                autoFocus
                autoComplete="off"
              />
            )}
          </FormField>
          <div className="grid gap-2">
            <Label htmlFor="invite-role" className="text-[13px] font-medium">Project role</Label>
            <Select value={inviteRole} onValueChange={(v) => { setInviteRole(v); setInviteFieldErrors((s) => ({ ...s, role: '' })) }} disabled={inviteBusy}>
              <SelectTrigger id="invite-role" className={fieldInputClass}><SelectValue /></SelectTrigger>
              <SelectContent>
                {INVITATION_ROLES.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[12px] text-muted-foreground">Owners cannot be invited. Choose Admin, Editor, or Viewer.</p>
          </div>
        </form>
      </DialogShell>

      <DialogShell
        open={roleDialog.open}
        title="Change member role"
        description={roleDialog.member ? `Update the project role for ${displayNameFor(roleDialog.member)}.` : 'Update member role.'}
        onClose={roleDialog.busy ? () => {} : () => setRoleDialog({ open: false, member: null, role: 'viewer', busy: false, error: '' })}
        footer={
          <>
            <Button type="button" variant="outline" className="h-9" onClick={() => setRoleDialog({ open: false, member: null, role: 'viewer', busy: false, error: '' })} disabled={roleDialog.busy}>
              Cancel
            </Button>
            <Button type="button" className="h-9" onClick={handleRoleSave} disabled={roleDialog.busy || !roleDialog.member || roleDialog.role === roleDialog.member.role}>
              {roleDialog.busy ? 'Saving…' : 'Save role'}
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <FormError>{roleDialog.error}</FormError>
          <div className="grid gap-2">
            <Label htmlFor="member-role-select" className="text-[13px] font-medium">Role</Label>
            <Select value={roleDialog.role} onValueChange={(v) => setRoleDialog((s) => ({ ...s, role: v }))} disabled={roleDialog.busy}>
              <SelectTrigger id="member-role-select" className={fieldInputClass}><SelectValue /></SelectTrigger>
              <SelectContent>
                {INVITATION_ROLES.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[12px] text-muted-foreground">Members cannot be assigned the Owner role.</p>
          </div>
        </div>
      </DialogShell>

      <ConfirmDialog
        open={removeDialog.open}
        title="Remove member"
        description={removeDialog.member ? `Remove ${displayNameFor(removeDialog.member)} from this project? They will lose access to this project.` : 'Remove this member from the project?'}
        confirmLabel="Remove member"
        busyLabel="Removing…"
        busy={removeDialog.busy}
        error={removeDialog.error}
        destructive
        onConfirm={handleRemoveConfirm}
        onClose={() => !removeDialog.busy && setRemoveDialog({ open: false, member: null, busy: false, error: '' })}
      />

      <ConfirmDialog
        open={revokeDialog.open}
        title="Revoke invitation"
        description={revokeDialog.invitation ? `Revoke the pending invitation for ${revokeDialog.invitation.invitee_username || `user ${revokeDialog.invitation.invitee_id}`}?` : 'Revoke this pending invitation?'}
        confirmLabel="Revoke"
        busyLabel="Revoking…"
        busy={revokeDialog.busy}
        error={revokeDialog.error}
        destructive
        onConfirm={handleRevokeConfirm}
        onClose={() => !revokeDialog.busy && setRevokeDialog({ open: false, invitation: null, busy: false, error: '' })}
      />
    </div>
  )
}

function MemberRow({ member, canManage, onChangeRole, onRemove }) {
  const name = displayNameFor(member)
  const username = member?.username?.trim()
  const initials = initialsFor(member?.name, member?.username, member?.user_id)
  const joined = member?.joined_at ? formatMaybeDate(member.joined_at) : null
  const showUsername = Boolean(username) && username !== name

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[#E5E1D9] bg-[#F7F5F1] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <Avatar className="size-10 shrink-0 border border-[#E5E1D9]">
          <AvatarFallback className="bg-[#EAE7E0] text-[12px] font-semibold tracking-[0.02em] text-[#4A463F]">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-[14px] font-medium text-foreground">{name}</p>
            <Badge variant="outline" className={cn('font-medium capitalize', roleBadgeClass(member?.role))}>
              {formatRole(member?.role)}
            </Badge>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] text-muted-foreground">
            {showUsername ? <span>@{username}</span> : null}
            {joined ? <span>Joined {joined}</span> : member?.isOwner ? <span>Project owner</span> : null}
          </div>
        </div>
      </div>

      {canManage ? (
        <div className="flex shrink-0 items-center gap-2 pl-[52px] sm:pl-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5">
                <MoreHorizontal size={14} aria-hidden="true" />
                Manage
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onSelect={onChangeRole}>
                <Shield size={14} />
                Change role
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onRemove}>
                <Trash2 size={14} />
                Remove member
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
    </div>
  )
}
