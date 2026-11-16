import { useEffect, useState } from 'react'
import { CircleAlert } from 'lucide-react'
import {
  actionConsequence,
  changedFields,
  formatDateTime,
  parseActionSummary,
} from './format.js'

function scopeLabel(scope) {
  if (!scope) return ''
  return scope.charAt(0).toUpperCase() + scope.slice(1)
}

/**
 * Renders a pending action returned by the agent backend. Approval and
 * rejection always go through the backend confirmation endpoints; this card
 * never performs a calendar operation itself.
 */
export default function ConfirmationCard({
  action,
  busy = false,
  busyLabel = 'Working…',
  error = '',
  onApprove,
  onReject,
}) {
  const [now, setNow] = useState(() => Date.now())
  const preview = parseActionSummary(action?.summary)
  const args = action?.tool_arguments || {}

  const operation = preview.operation || 'Review action'
  const title =
    preview.event ||
    args.title ||
    (args.event_id ? `Event #${args.event_id}` : 'Calendar action')
  const when =
    preview.when ||
    [args.start || args.start_date, args.end || args.end_date]
      .filter(Boolean)
      .map(formatDateTime)
      .join(' → ')
  const timezone = preview.timezone || args.timezone || ''
  const scope = preview.scope || ''
  const changes = preview.changes || changedFields(args)
  const occurrence = preview.occurrence || args.occurrence_start || ''

  const expiresAt = action?.expires_at
    ? new Date(action.expires_at).getTime()
    : null

  useEffect(() => {
    if (!expiresAt) return undefined
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [expiresAt])

  const expired = expiresAt !== null && expiresAt <= now
  const details = [
    when ? ['When', when] : null,
    timezone ? ['Timezone', timezone] : null,
    scope ? ['Scope', scopeLabel(scope)] : null,
    occurrence ? ['Occurrence', formatDateTime(occurrence)] : null,
    changes ? ['Changes', changes] : null,
  ].filter(Boolean)

  return (
    <article
      className={`ca-confirm${expired ? ' is-expired' : ''}`}
      aria-label={`${operation} for ${title}`}
    >
      <header className="ca-confirm-head">
        <span className="ca-confirm-kind">{operation}</span>
        {scope && <span className="ca-confirm-scope">{scopeLabel(scope)}</span>}
      </header>

      <h4 className="ca-confirm-title">{title}</h4>

      {details.length > 0 && (
        <dl className="ca-confirm-details">
          {details.map(([label, value]) => (
            <div key={label} className="ca-confirm-detail">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}

      <p className="ca-confirm-consequence">
        {expired
          ? 'This request expired and can no longer be approved.'
          : actionConsequence(action?.tool_name)}
      </p>

      {!expired && expiresAt && (
        <p className="ca-confirm-expiry">
          Expires {formatDateTime(action.expires_at)}
        </p>
      )}

      {error && (
        <p className="ca-confirm-error" role="alert">
          <CircleAlert size={12} aria-hidden="true" />
          {error}
        </p>
      )}

      <div className="ca-confirm-actions">
        <button
          type="button"
          className="ca-btn ca-btn--ghost"
          onClick={onReject}
          disabled={busy || expired}
        >
          {busy && busyLabel.startsWith('Reject') ? busyLabel : 'Reject'}
        </button>
        <button
          type="button"
          className="ca-btn ca-btn--solid"
          onClick={onApprove}
          disabled={busy || expired}
        >
          {busy && busyLabel.startsWith('Approv') ? busyLabel : 'Approve'}
        </button>
      </div>
    </article>
  )
}
