import { useEffect } from 'react'
import { X } from 'lucide-react'
import IconButton from './IconButton.jsx'

/**
 * Feature-local modal dialog: backdrop, Escape handling and scroll lock
 * (same interaction pattern as the calendar's Modal, with documents tokens).
 */
export default function Dialog({ open, title, onClose, children, footer }) {
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
      className="docs-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        className="docs-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="docs-dialog-title"
      >
        <header className="docs-dialog-header">
          <h2 className="docs-dialog-title" id="docs-dialog-title">
            {title}
          </h2>
          <IconButton icon={X} label="Close" small onClick={onClose} />
        </header>

        <div className="docs-dialog-body">{children}</div>

        {footer && <footer className="docs-dialog-footer">{footer}</footer>}
      </div>
    </div>
  )
}
