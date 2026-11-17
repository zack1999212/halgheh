import { useState } from 'react'
import { ChevronRight } from 'lucide-react'

/**
 * Collapsible sidebar section with a small-caps title, an optional action
 * button (e.g. "+") and the section body. Sections are keyboard accessible:
 * the whole header row is a real button with aria-expanded.
 */
export default function SidebarSection({ title, action, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className={`docs-section${open ? ' is-open' : ''}`}>
      <div className="docs-section-header">
        <button
          type="button"
          className="docs-section-toggle"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          <ChevronRight
            size={13}
            className={`docs-chevron${open ? ' is-open' : ''}`}
            aria-hidden="true"
          />
          <span>{title}</span>
        </button>
        {action && <div className="docs-section-action">{action}</div>}
      </div>
      {open && <div className="docs-section-body">{children}</div>}
    </section>
  )
}
