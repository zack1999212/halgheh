import '../auth.css'

/**
 * Shared shell for the authentication pages: page background, card,
 * Halgheh branding, heading block and footer switch link.
 */
export default function AuthLayout({ title, description, children, footer }) {
  return (
    <div className="auth-page">
      <main className="auth-card">
        <header className="auth-header">
          <div className="auth-brand">
            <span className="auth-brand-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle
                  cx="12"
                  cy="12"
                  r="8"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <circle cx="12" cy="12" r="2.6" fill="currentColor" />
              </svg>
            </span>
            <span className="auth-brand-name">Halgheh</span>
          </div>
          <h1 className="auth-title">{title}</h1>
          {description && <p className="auth-description">{description}</p>}
        </header>

        {children}

        {footer && <p className="auth-switch">{footer}</p>}
      </main>
    </div>
  )
}
