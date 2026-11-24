import { Check, ExternalLink, Mail, MailOpen, Trash2, X } from 'lucide-react' 
import { Link } from 'react-router-dom'
import {
  formatDateTime,
  formatEventContext,
  formatNotificationType,
  formatRelativeTime,
} from './format.js'

function statusLabel(status) {
  if (!status) return ''
  return status.charAt(0).toUpperCase() + status.slice(1)
}

export default function NotificationItem({
  notification,
  busy,
  onToggleRead,
  onDelete,
  invitation,
  invitationBusy,
  invitationBusyId,
  onAcceptInvitation,
  onDeclineInvitation,
}) {
  const eventContext = formatEventContext(notification)
  const typeLabel = formatNotificationType(notification.type)

  const isWorkspaceInvite = notification.type === 'workspace_invitation'
  const invitePending = isWorkspaceInvite && invitation?.status === 'pending'
  const inviteResponded = isWorkspaceInvite && invitation && invitation.status !== 'pending'
  const thisInviteBusy = invitation != null && invitationBusyId === invitation.id

  return (
    <li
      className={`notification-item${notification.is_read ? '' : ' is-unread'}`}
    >
      <div className="notification-item-head">
        <p className="notification-item-title">{notification.title}</p>
        <time
          className="notification-item-time"
          dateTime={notification.created_at}
          title={formatDateTime(notification.created_at)}
        >
          {formatRelativeTime(notification.created_at)}
        </time>
      </div>

      {notification.message && (
        <p className="notification-item-message">{notification.message}</p>
      )}

      {(typeLabel || eventContext) && (
        <p className="notification-item-meta">
          {typeLabel}
          {typeLabel && eventContext ? ' · ' : ''}
          {eventContext}
        </p>
      )}

      <div className="notification-item-actions">
        {(notification.type === 'project_invitation' ||
          notification.type === 'workspace_invitation_accepted') && (
          <Link
            to="/workspace"
            className="notification-item-action"
            aria-label="View workspace"
          >
            <Mail size={13} aria-hidden="true" />
            <span>View workspace</span>
          </Link>
        )}

        {notification.task_id ? (
          <Link
            to={`/tasks?task=${notification.task_id}`}
            className="notification-item-action"
            aria-label={`View task for "${notification.title}"`}
          >
            <ExternalLink size={13} aria-hidden="true" />
            <span>View task</span>
          </Link>
        ) : null}

        {invitePending && (
          <>
            <button
              type="button"
              className="notification-item-action"
              onClick={() => onAcceptInvitation?.(invitation)}
              disabled={invitationBusy}
              aria-label={`Accept invitation to ${invitation.workspace_name || 'workspace'}`}
            >
              <Check size={13} aria-hidden="true" />
              <span>{thisInviteBusy ? 'Accepting…' : 'Accept'}</span>
            </button>
            <button
              type="button"
              className="notification-item-action notification-item-action--danger"
              onClick={() => onDeclineInvitation?.(invitation)}
              disabled={invitationBusy}
              aria-label={`Decline invitation to ${invitation.workspace_name || 'workspace'}`}
            >
              <X size={13} aria-hidden="true" />
              <span>{thisInviteBusy ? 'Declining…' : 'Decline'}</span>
            </button>
          </>
        )}

        {inviteResponded && (
          <span className="notification-item-status" role="status">
            {statusLabel(invitation.status)}
          </span>
        )}
        <button
          type="button"
          className="notification-item-action"
          onClick={() => onToggleRead(notification)}
          disabled={busy}
          aria-label={
            notification.is_read
              ? `Mark "${notification.title}" as unread`
              : `Mark "${notification.title}" as read`
          }
        >
          {notification.is_read ? (
            <MailOpen size={13} aria-hidden="true" />
          ) : (
            <Check size={13} aria-hidden="true" />
          )}
          <span>{notification.is_read ? 'Unread' : 'Read'}</span>
        </button>
        <button
          type="button"
          className="notification-item-action notification-item-action--danger"
          onClick={() => onDelete(notification.id)}
          disabled={busy}
          aria-label={`Delete "${notification.title}"`}
        >
          <Trash2 size={13} aria-hidden="true" />
          <span>Delete</span>
        </button>
      </div>
    </li>
  )
}
