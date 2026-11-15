import { CircleAlert } from 'lucide-react'

/** Form-level alert used for API and submission errors. */
export default function FormError({ children }) {
  if (!children) {
    return null
  }

  return (
    <div className="auth-form-error" role="alert">
      <CircleAlert size={16} aria-hidden="true" />
      <p>{children}</p>
    </div>
  )
}
