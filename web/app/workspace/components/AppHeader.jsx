import { Menu } from 'lucide-react'
import NotificationMenu from '../../notifications/NotificationMenu.jsx'
import ProfileMenu from './ProfileMenu.jsx'

export default function AppHeader({
  title,
  user,
  onOpenNavigation,
  onLogout,
  onUnauthorized,
}) {
  return (
    <header className="app-header">
      <div className="app-header-left">
        <button
          type="button"
          className="icon-button app-nav-toggle"
          onClick={onOpenNavigation}
          aria-label="Open navigation"
        >
          <Menu size={18} aria-hidden="true" />
        </button>
        <h1 className="app-header-title">{title}</h1>
      </div>

      <div className="app-header-right">
        <NotificationMenu onUnauthorized={onUnauthorized} />
        <span className="app-header-divider" aria-hidden="true" />
        <ProfileMenu user={user} onLogout={onLogout} />
      </div>
    </header>
  )
}
