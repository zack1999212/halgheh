import { useEffect } from 'react'
import { X } from 'lucide-react'

/** Shared dialog shell: backdrop, Escape handling and scroll lock. */
export default function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  wide = false,
}) {
  useEffect(() => {
    if (!open) {
      return undefined
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose])

  if (!open) {
    return null
  }

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        className={`dialog${wide ? ' dialog--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <header className="dialog-header">
          <h2 className="dialog-title" id="dialog-title">
            {title}
          </h2>
          <button
            type="button"
            className="icon-button icon-button--small"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="dialog-content">{children}</div>

        {footer && <footer className="dialog-footer">{footer}</footer>}
      </div>
    </div>
  )
}
