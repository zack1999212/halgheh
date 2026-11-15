import { useEffect, useRef, useState } from 'react'
import { ChevronDown, LogOut, Settings } from 'lucide-react'

function initialsFor(user) {
  const source = (user?.name || user?.username || '').trim()
  if (!source) {
    return '·'
  }
  const parts = source.split(/\s+/).slice(0, 2)
  return parts.map((part) => part.charAt(0).toUpperCase()).join('')
}

export default function ProfileMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    if (!open) {
      return undefined
    }

    function handlePointerDown(event) {
      if (!containerRef.current?.contains(event.target)) {
        setOpen(false)
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const displayName = user?.name?.trim() || user?.username || 'Your account'
  const initials = initialsFor(user)

  return (
    <div className="profile-menu" ref={containerRef}>
      <button
        type="button"
        className={`profile-trigger${open ? ' is-active' : ''}`}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Open profile menu"
      >
        <span className="profile-avatar" aria-hidden="true">
          {initials}
        </span>
        <span className="profile-trigger-name">{displayName}</span>
        <ChevronDown size={14} aria-hidden="true" className="profile-chevron" />
      </button>

      {open && (
        <div className="profile-panel" role="menu">
          <div className="profile-panel-head">
            <span className="profile-avatar" aria-hidden="true">
              {initials}
            </span>
            <span className="profile-panel-identity">
              <span className="profile-panel-name">{displayName}</span>
              {user?.username && (
                <span className="profile-panel-handle">@{user.username}</span>
              )}
              {user?.created_at && (
                <span className="profile-panel-since">
                  Member since{' '}
                  {new Date(user.created_at).toLocaleDateString(undefined, {
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              )}
            </span>
          </div>

          <div className="profile-panel-divider" />

          <button
            type="button"
            className="profile-panel-item"
            role="menuitem"
            disabled
          >
            <Settings size={15} aria-hidden="true" />
            Profile settings
            <span className="profile-panel-hint">Soon</span>
          </button>

          <button
            type="button"
            className="profile-panel-item profile-panel-item--danger"
            role="menuitem"
            onClick={onLogout}
          >
            <LogOut size={15} aria-hidden="true" />
            Log out
          </button>
        </div>
      )}
    </div>
  )
}
