import { LoaderCircle } from 'lucide-react'

/** Primary authentication button with a built-in loading state. */
export default function SubmitButton({ loading = false, loadingLabel, children }) {
  return (
    <button
      type="submit"
      className="auth-submit"
      disabled={loading}
      aria-busy={loading}
    >
      {loading && (
        <LoaderCircle
          className="auth-submit-spinner"
          size={16}
          aria-hidden="true"
        />
      )}
      <span>{loading ? loadingLabel : children}</span>
    </button>
  )
}
