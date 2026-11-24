import { Link } from 'react-router-dom'
import { Separator } from '@/components/ui/separator'
import NotificationMenu from '../../notifications/NotificationMenu.jsx'
import ModuleSwitcher from './ModuleSwitcher.jsx'
import ProfileMenu from './ProfileMenu.jsx'
import WorkspaceSelector from './WorkspaceSelector.jsx'

function BrandMark() {
  return (
    <span
      className="flex size-[30px] shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-border bg-foreground text-background"
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-[18px]">
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="12" r="2.6" fill="currentColor" />
      </svg>
    </span>
  )
}

/**
 * Shared application header for all authenticated modules.
 *
 * Brand is on the left. Actions are on the right: workspace selector,
 * module switcher, notifications, then profile. The module switcher remains
 * immediately left of notifications.
 */
export default function AppHeader({ user, received, onLogout, onUnauthorized, onUserUpdated }) {
  return (
    <header className="sticky top-0 z-30 flex h-[var(--header-height)] shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-6 max-lg:px-4">
      <Link
        to="/home"
        className="flex min-w-0 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label="Go to home page"
      >
        <BrandMark />
        <span className="truncate text-[15px] font-semibold tracking-[-0.01em] text-foreground">
          Halgheh
        </span>
      </Link>

      <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
        <WorkspaceSelector received={received} onUnauthorized={onUnauthorized} />
        <ModuleSwitcher />
        <NotificationMenu received={received} onUnauthorized={onUnauthorized} />
        <Separator orientation="vertical" className="mx-0.5 h-5" />
        <ProfileMenu user={user} onLogout={onLogout} onUserUpdated={onUserUpdated} />
      </div>
    </header>
  )
}
