import { useId, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

/** Password input with an accessible show/hide visibility toggle. */
export default function PasswordField({
  label,
  error,
  hint,
  id,
  ...inputProps
}) {
  const [visible, setVisible] = useState(false)
  const generatedId = useId()
  const inputId = id || `field-${generatedId}`
  const errorId = `${inputId}-error`

  return (
    <div className="auth-field">
      <label className="auth-field-label" htmlFor={inputId}>
        {label}
      </label>
      <div className="auth-input-wrap">
        <input
          id={inputId}
          type={visible ? 'text' : 'password'}
          className={`auth-input auth-input--with-action${error ? ' auth-input--invalid' : ''}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          {...inputProps}
        />
        <button
          type="button"
          className="auth-input-action"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          disabled={inputProps.disabled}
        >
          {visible ? (
            <EyeOff size={16} aria-hidden="true" />
          ) : (
            <Eye size={16} aria-hidden="true" />
          )}
        </button>
      </div>
      {error && (
        <p className="auth-field-error" id={errorId}>
          {error}
        </p>
      )}
      {!error && hint && <p className="auth-field-hint">{hint}</p>}
    </div>
  )
}
