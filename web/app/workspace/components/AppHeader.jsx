import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import NotificationMenu from '../../notifications/NotificationMenu.jsx'
import ProfileMenu from './ProfileMenu.jsx'

/**
 * Shared application header.
 *
 * The navigation control comes from the sidebar context (`SidebarTrigger`), so
 * it collapses the docked sidebar on desktop and opens the mobile Sheet without
 * any extra responsive state here.
 */
export default function AppHeader({ title, user, onLogout, onUnauthorized }) {
  return (
    <header className="sticky top-0 z-30 flex h-[var(--header-height)] shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-6 max-lg:px-4">
      <div className="flex min-w-0 items-center gap-2">
        <SidebarTrigger className="size-[34px] text-muted-foreground hover:bg-accent hover:text-foreground" />
        <h1 className="truncate text-[15px] font-semibold tracking-[-0.01em] max-sm:text-sm">
          {title}
        </h1>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <NotificationMenu onUnauthorized={onUnauthorized} />
        <Separator orientation="vertical" className="h-5" />
        <ProfileMenu user={user} onLogout={onLogout} />
      </div>
    </header>
  )
}
