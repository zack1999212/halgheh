import { Inbox } from 'lucide-react'
import { Button } from '@/components/ui/button'
import DialogShell from '@/components/shared/DialogShell'
import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import LoadingState from '@/components/shared/LoadingState'
import { formatDateTime } from '../../notifications/format.js'
import { InvitationStatusBadge, RoleBadge } from './InvitationBadges.jsx'

/**
 * Received invitations for the current user, reachable from the global
 * workspace selector even before joining the invited workspace. Only the
 * invited user can act on these; the backend enforces that. Accept/decline
 * buttons lock while their request is in flight.
 */
export default function ReceivedInvitationsDialog({
  open,
  onClose,
  items,
  loading,
  error,
  busyId,
  onRefresh,
  onAccept,
  onDecline,
}) {
  // Declined invitations drop out of the visible received list; the store
  // keeps them so the notification window can still show the outcome.
  const visibleItems = items.filter((item) => item.status !== 'declined')

  return (
    <DialogShell
      open={open}
      title="Workspace invitations"
      description="Invitations sent to you. Accept to join a workspace with the assigned role."
      onClose={onClose}
      footer={
        <Button type="button" variant="outline" className="h-9" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="grid gap-3">
        {loading && <LoadingState label="Loading invitations…" />}

        {!loading && error && <ErrorState message={error} onRetry={onRefresh} />}

        {!loading && !error && visibleItems.length === 0 && (
          <EmptyState
            icon={Inbox}
            className="py-6"
            title="No invitations"
            description="When someone invites you to a shared workspace, it will appear here."
          />
        )}

        {!loading && !error && visibleItems.length > 0 && (
          <ul className="divide-y divide-border">
            {visibleItems.map((invitation) => {
              const pending = invitation.status === 'pending'
              const busy = busyId === invitation.id
              const inviter = invitation.inviter_name || invitation.inviter_username
              return (
                <li key={invitation.id} className="grid gap-2 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-medium">
                        {invitation.workspace_name || 'Workspace'}
                      </p>
                      <p className="truncate text-[12px] text-muted-foreground">
                        {inviter ? `Invited by ${inviter}` : 'Invitation'}
                        {' · '}
                        {formatDateTime(invitation.created_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <RoleBadge role={invitation.role} />
                      <InvitationStatusBadge status={invitation.status} />
                    </div>
                  </div>

                  {pending && (
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        className="h-8"
                        onClick={() => onAccept(invitation)}
                        disabled={busyId != null}
                      >
                        {busy ? 'Accepting…' : 'Accept'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => onDecline(invitation)}
                        disabled={busyId != null}
                      >
                        {busy ? 'Declining…' : 'Decline'}
                      </Button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </DialogShell>
  )
}