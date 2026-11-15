import { useId } from 'react'

/** Single-line text input with a label, optional hint and inline error. */
export default function TextField({
  label,
  optional = false,
  error,
  hint,
  id,
  className = '',
  ...inputProps
}) {
  const generatedId = useId()
  const inputId = id || `field-${generatedId}`
  const errorId = `${inputId}-error`

  return (
    <div className="auth-field">
      <label className="auth-field-label" htmlFor={inputId}>
        {label}
        {optional && <span className="auth-field-optional"> (optional)</span>}
      </label>
      <input
        id={inputId}
        className={`auth-input${error ? ' auth-input--invalid' : ''} ${className}`.trim()}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...inputProps}
      />
      {error && (
        <p className="auth-field-error" id={errorId}>
          {error}
        </p>
      )}
      {!error && hint && <p className="auth-field-hint">{hint}</p>}
    </div>
  )
}
