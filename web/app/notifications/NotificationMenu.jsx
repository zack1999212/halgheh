import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bell,
  CheckCheck,
  CircleAlert,
  Inbox,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import useNotifications from './useNotifications.js'
import NotificationItem from './NotificationItem.jsx'
import NotificationPreferences from './NotificationPreferences.jsx'
import { formatRelativeTime } from './format.js'
import './notifications.css'

export default function NotificationMenu({ received, onUnauthorized }) {
  const {
    items,
    unreadCount,
    loading,
    error,
    busyId,
    bulkBusy,
    refresh,
    toggleRead,
    removeOne,
    markAllRead,
    removeAll,
    preferences,
    preferencesLoading,
    preferencesError,
    savingPreference,
    loadPreferences,
    setCalendarReminders,
  } = useNotifications({ onUnauthorized })

  // Shared received-invitations store (owned by the app shell). `refresh` is
  // stable; the accept/decline handlers and items are read for rendering.
  const refreshInvitations = received?.refresh
  const invitationItems = received?.items
  const invitationBusyId = received?.busyId
  const acceptInvitation = received?.accept
  const declineInvitation = received?.decline

  const invitationsById = useMemo(() => {
    const map = new Map()
    for (const invitation of invitationItems || []) {
      map.set(invitation.id, invitation)
    }
    return map
  }, [invitationItems])

  const [open, setOpen] = useState(false)
  const [confirmingDeleteAll, setConfirmingDeleteAll] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    if (!open) {
      return undefined
    }

    function handlePointerDown(event) {
      if (!containerRef.current?.contains(event.target)) {
        setOpen(false)
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      setConfirmingDeleteAll(false)
      return
    }
    refresh()
    loadPreferences()
    refreshInvitations?.()
  }, [open, refresh, loadPreferences, refreshInvitations])

  const hasUnread = unreadCount > 0
  const badgeLabel = unreadCount > 99 ? '99+' : String(unreadCount)

  // The newest unread notification is the most useful peek; fall back to the
  // newest notification overall so the tooltip still previews something.
  const preview = useMemo(() => {
    const latestUnread = items.find((item) => !item.is_read)
    return {
      notification: latestUnread || items[0] || null,
      extraUnread: Math.max(unreadCount - 1, 0),
    }
  }, [items, unreadCount])

  const bellButton = (
    <button
      type="button"
      className={`icon-button${open ? ' is-active' : ''}`}
      onClick={() => setOpen((current) => !current)}
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-label={
        hasUnread
          ? `Notifications, ${unreadCount} unread`
          : 'Notifications'
      }
    >
      <Bell size={18} aria-hidden="true" />
      {hasUnread && (
        <span className="notification-badge" aria-hidden="true">
          {badgeLabel}
        </span>
      )}
    </button>
  )

  return (
    <div className="notification-menu" ref={containerRef}>
      {open ? (
        bellButton
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>{bellButton}</TooltipTrigger>
          <TooltipContent side="bottom" align="end" className="w-72 p-0">
            <div className="flex flex-col gap-1 p-3">
              {preview.notification ? (
                <>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[13px] font-semibold">
                      {preview.notification.title}
                    </p>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {formatRelativeTime(preview.notification.created_at)}
                    </span>
                  </div>
                  {preview.notification.message && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {preview.notification.message}
                    </p>
                  )}
                  {preview.extraUnread > 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      +{preview.extraUnread} more unread · click to view all
                    </p>
                  )}
                </>
              ) : (
                <p className="text-[13px] text-muted-foreground">
                  {loading
                    ? 'Loading notifications…'
                    : "You're all caught up."}
                </p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      )}

      {open && (
        <div
          className="notification-panel"
          role="dialog"
          aria-label="Notifications"
        >
          <div className="notification-panel-head">
            <h2 className="notification-panel-title">
              Notifications
              {hasUnread && (
                <span className="notification-panel-count">
                  {unreadCount} unread
                </span>
              )}
            </h2>
            <button
              type="button"
              className="icon-button icon-button--small"
              onClick={() => refresh({ showLoading: true })}
              disabled={loading}
              aria-label="Refresh notifications"
            >
              <RefreshCw
                size={14}
                aria-hidden="true"
                className={loading ? 'notification-spin' : undefined}
              />
            </button>
          </div>

          <div className="notification-panel-actions">
            <button
              type="button"
              className="notification-panel-action"
              onClick={markAllRead}
              disabled={!hasUnread || bulkBusy}
            >
              <CheckCheck size={13} aria-hidden="true" />
              Mark all read
            </button>

            {confirmingDeleteAll ? (
              <>
                <span className="notification-confirm-label">Delete all?</span>
                <button
                  type="button"
                  className="notification-panel-action notification-panel-action--danger"
                  onClick={removeAll}
                  disabled={bulkBusy}
                >
                  Confirm
                </button>
                <button
                  type="button"
                  className="notification-panel-action"
                  onClick={() => setConfirmingDeleteAll(false)}
                  disabled={bulkBusy}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                className="notification-panel-action notification-panel-action--danger"
                onClick={() => setConfirmingDeleteAll(true)}
                disabled={!items.length || bulkBusy}
              >
                <Trash2 size={13} aria-hidden="true" />
                Delete all
              </button>
            )}
          </div>

          <div className="notification-panel-body">
            {loading && (
              <div className="notification-skeleton" aria-hidden="true">
                <span className="notification-skeleton-line" />
                <span className="notification-skeleton-line notification-skeleton-line--short" />
                <span className="notification-skeleton-line" />
              </div>
            )}

            {!loading && error && (
              <div className="notification-status" role="alert">
                <CircleAlert size={18} aria-hidden="true" />
                <p>{error}</p>
                <button
                  type="button"
                  className="notification-retry"
                  onClick={() => refresh({ showLoading: true })}
                >
                  Retry
                </button>
              </div>
            )}

            {!loading && !error && items.length === 0 && (
              <div className="notification-empty">
                <Inbox size={20} aria-hidden="true" />
                <p>You&apos;re all caught up.</p>
              </div>
            )}

            {!loading && !error && items.length > 0 && (
              <ul className="notification-list">
                {items.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    busy={busyId === notification.id || bulkBusy}
                    onToggleRead={toggleRead}
                    onDelete={removeOne}
                    invitation={
                      notification.type === 'workspace_invitation' && notification.invitation_id != null
                        ? invitationsById.get(notification.invitation_id)
                        : undefined
                    }
                    invitationBusy={invitationBusyId != null}
                    invitationBusyId={invitationBusyId}
                    onAcceptInvitation={acceptInvitation}
                    onDeclineInvitation={declineInvitation}
                  />
                ))}
              </ul>
            )}
          </div>

          <NotificationPreferences
            preferences={preferences}
            loading={preferencesLoading}
            error={preferencesError}
            saving={savingPreference}
            onToggle={setCalendarReminders}
            onRetry={() => loadPreferences({ force: true })}
          />
        </div>
      )}
    </div>
  )
}
