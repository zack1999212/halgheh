import { useEffect, useRef, useState } from 'react'

/**
 * Small dropdown menu used for "⋯" actions on documents and folders.
 *
 * `trigger` is a render function that receives the button props
 * ({ onClick, 'aria-haspopup', 'aria-expanded' }) and returns the trigger
 * element. `items` is a list of { label, icon, onSelect, danger, disabled }.
 * The menu closes on selection, outside click and Escape.
 */
export default function Menu({ trigger, items, align = 'end', ariaLabel = 'More actions' }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) {
      return undefined
    }

    function handlePointer(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false)
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div className="docs-menu" ref={rootRef}>
      {trigger({
        onClick: () => setOpen((value) => !value),
        'aria-haspopup': 'menu',
        'aria-expanded': open,
      })}
      {open && (
        <div
          className={`docs-menu-panel docs-menu-panel--${align}`}
          role="menu"
          aria-label={ariaLabel}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={`docs-menu-item${item.danger ? ' docs-menu-item--danger' : ''}`}
              disabled={item.disabled}
              onClick={() => {
                setOpen(false)
                item.onSelect?.()
              }}
            >
              {item.icon ? <item.icon size={15} aria-hidden="true" /> : null}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
