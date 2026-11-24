import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/** Roles that can be granted through an invitation (never owner). */
export const INVITABLE_ROLES = ['admin', 'editor', 'viewer']

const ROLE_LABELS = {
  owner: 'Owner',
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
}

export function roleLabel(role) {
  return ROLE_LABELS[role] || role || 'Unknown'
}

/**
 * Monochrome role badge. Owner gets the filled treatment so the workspace
 * owner is clearly distinguished from ordinary members.
 */
export function RoleBadge({ role, className }) {
  return (
    <Badge
      variant={role === 'owner' ? 'default' : 'secondary'}
      className={cn('px-2 py-0 text-[11px] font-medium', className)}
    >
      {roleLabel(role)}
    </Badge>
  )
}

const STATUS_LABELS = {
  pending: 'Pending',
  accepted: 'Accepted',
  declined: 'Declined',
  revoked: 'Revoked',
  expired: 'Expired',
}

export function invitationStatusLabel(status) {
  return STATUS_LABELS[status] || status || 'Unknown'
}

/**
 * Invitation status badge: pending is secondary, accepted is filled, and
 * terminal inactive states (declined/revoked/expired) are muted outlines so
 * the three groups stay visually distinguishable in the monochrome theme.
 */
export function InvitationStatusBadge({ status, className }) {
  const variant =
    status === 'accepted' ? 'default' : status === 'pending' ? 'secondary' : 'outline'
  return (
    <Badge
      variant={variant}
      className={cn(
        'px-2 py-0 text-[11px] font-medium',
        variant === 'outline' && 'border-border text-muted-foreground',
        className,
      )}
    >
      {invitationStatusLabel(status)}
    </Badge>
  )
}