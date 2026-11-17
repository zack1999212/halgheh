import { useCallback, useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { getCurrentUser, clearSession } from '../auth/api.js'
import { NAV_ITEMS, findNavItem } from './navigation.js'
import Sidebar from './components/Sidebar.jsx'
import AppHeader from './components/AppHeader.jsx'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import './shell.css'

/**
 * Shared application shell.
 *
 * `SidebarProvider` owns the collapse state (cookie-persisted by the shadcn
 * component) and swaps the sidebar for a Sheet below the 1024px breakpoint.
 * `SidebarInset` is the main column: header plus the page outlet, whose
 * padding stays in `shell.css` so the Calendar keeps the viewport height it
 * measures against.
 */
export default function AppLayout() {
  const [user, setUser] = useState(null)
  const location = useLocation()
  const navigate = useNavigate()

  const handleUnauthorized = useCallback(() => {
    clearSession()
    navigate('/login', { replace: true })
  }, [navigate])

  const handleLogout = useCallback(() => {
    clearSession()
    navigate('/login', { replace: true })
  }, [navigate])

  useEffect(() => {
    let active = true

    getCurrentUser()
      .then((currentUser) => {
        if (active) {
          setUser(currentUser)
        }
      })
      .catch((err) => {
        if (active && err?.status === 401) {
          handleUnauthorized()
        }
      })

    return () => {
      active = false
    }
  }, [handleUnauthorized])

  const activeItem = findNavItem(location.pathname)

  return (
    <SidebarProvider
      style={{
        '--sidebar-width': 'var(--app-sidebar-width)',
        '--sidebar-width-icon': 'var(--app-sidebar-width-icon)',
      }}
      className="bg-background"
    >
      <Sidebar items={NAV_ITEMS} />

      <SidebarInset className="min-w-0">
        <AppHeader
          title={activeItem?.label || 'Halgheh'}
          user={user}
          onLogout={handleLogout}
          onUnauthorized={handleUnauthorized}
        />

        <div className="app-content">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
