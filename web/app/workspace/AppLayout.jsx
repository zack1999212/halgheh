import { useCallback, useEffect, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { getCurrentUser, clearSession } from '../auth/api.js'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ActiveWorkspaceProvider } from './ActiveWorkspaceContext.jsx'
import AppHeader from './components/AppHeader.jsx'
import './shell.css'

/**
 * Shared authenticated application shell.
 *
 * Owns global chrome only: the application header (brand, module switcher,
 * notifications, profile) and the main content outlet. Module-specific layouts
 * and navigation live inside each module route so modules remain isolated.
 */
export default function AppLayout() {
  const [user, setUser] = useState(null)
  const navigate = useNavigate()

  const handleUnauthorized = useCallback(() => {
    clearSession()
    navigate('/login', { replace: true })
  }, [navigate])

  const handleLogout = useCallback(() => {
    clearSession()
    navigate('/login', { replace: true })
  }, [navigate])

  const refreshUser = useCallback(async () => {
    try {
      const currentUser = await getCurrentUser()
      setUser(currentUser)
      return currentUser
    } catch (err) {
      if (err?.status === 401) {
        handleUnauthorized()
      }
      return null
    }
  }, [handleUnauthorized])

  const handleUserUpdated = useCallback((updatedUser) => {
    if (updatedUser) {
      setUser(updatedUser)
      return
    }
    refreshUser()
  }, [refreshUser])

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

  return (
    <TooltipProvider delayDuration={0}>
      <ActiveWorkspaceProvider user={user}>
        <div className="flex min-h-svh flex-col bg-background text-foreground">
          <AppHeader
            user={user}
            onLogout={handleLogout}
            onUnauthorized={handleUnauthorized}
            onUserUpdated={handleUserUpdated}
          />

          <main className="app-content flex min-h-0 flex-1 flex-col">
            <Outlet />
          </main>
        </div>
      </ActiveWorkspaceProvider>
    </TooltipProvider>
  )
}
