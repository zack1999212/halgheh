import { AlertCircle, RefreshCw } from 'lucide-react'

/** Shared error message with an optional retry action. */
export default function ErrorState({ message, onRetry, compact = false }) {
  return (
    <div className={`docs-error${compact ? ' docs-error--compact' : ''}`} role="alert">
      <span className="docs-error-icon" aria-hidden="true">
        <AlertCircle size={compact ? 14 : 18} />
      </span>
      <p className="docs-error-message">
        {message || 'Something went wrong. Please try again.'}
      </p>
      {onRetry && (
        <button type="button" className="docs-btn docs-btn--secondary" onClick={onRetry}>
          <RefreshCw size={13} aria-hidden="true" />
          Retry
        </button>
      )}
    </div>
  )
}
