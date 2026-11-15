export default function NotificationPreferences({
  preferences,
  loading,
  error,
  saving,
  onToggle,
  onRetry,
}) {
  return (
    <div className="notification-panel-footer">
      {loading && (
        <p className="notification-footer-note">Loading preferences…</p>
      )}

      {!loading && error && (
        <div className="notification-footer-error" role="alert">
          <span>{error}</span>
          <button type="button" className="notification-link-button" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}

      {!loading && !error && preferences && (
        <label className="notification-preference">
          <span className="notification-preference-text">
            <span className="notification-preference-label">
              Calendar reminders
            </span>
            <span className="notification-preference-hint">
              Notify me about upcoming events
            </span>
          </span>
          <input
            type="checkbox"
            className="switch-input"
            checked={preferences.calendar_reminders_enabled}
            disabled={saving}
            onChange={(event) => onToggle(event.target.checked)}
          />
          <span className="switch" aria-hidden="true" />
        </label>
      )}

      {!loading && !error && !preferences && (
        <p className="notification-footer-note">
          Notification preferences are unavailable.
        </p>
      )}
    </div>
  )
}
