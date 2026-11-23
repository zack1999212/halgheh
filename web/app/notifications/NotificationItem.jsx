import { Check, Mail, MailOpen, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  formatDateTime,
  formatEventContext,
  formatNotificationType,
  formatRelativeTime,
} from './format.js'

export default function NotificationItem({
  notification,
  busy,
  onToggleRead,
  onDelete,
}) {
  const eventContext = formatEventContext(notification)
  const typeLabel = formatNotificationType(notification.type)

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
        {notification.type === 'project_invitation' && (
          <Link
            to="/workspace"
            className="notification-item-action"
            aria-label="View workspace"
          >
            <Mail size={13} aria-hidden="true" />
            <span>View workspace</span>
          </Link>
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
