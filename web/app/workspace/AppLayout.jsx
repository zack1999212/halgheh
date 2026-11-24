import { useCallback, useEffect, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { getCurrentUser, clearSession } from '../auth/api.js'
import { TooltipProvider } from '@/components/ui/tooltip'
import { WorkspaceThemeProvider } from './WorkspaceThemeProvider.jsx'
import { ActiveWorkspaceProvider, useActiveWorkspace } from './ActiveWorkspaceContext.jsx'
import useReceivedInvitations from './hooks/useReceivedInvitations.js'
import { useWorkspaceTheme } from './hooks/useWorkspaceTheme.js'
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
    <WorkspaceThemeProvider>
      <TooltipProvider delayDuration={0}>
        <ActiveWorkspaceProvider user={user}>
          <AppShell
            user={user}
            onLogout={handleLogout}
            onUnauthorized={handleUnauthorized}
            onUserUpdated={handleUserUpdated}
          />
        </ActiveWorkspaceProvider>
      </TooltipProvider>
    </WorkspaceThemeProvider>
  )
}

/**
 * Inner shell rendered inside ActiveWorkspaceProvider so it can share one
 * received-invitations store between the notification window and the
 * workspace selector. Accepting anywhere reloads the accessible workspace
 * list without changing the current selection.
 */
function AppShell({ user, onLogout, onUnauthorized, onUserUpdated }) {
  const { theme } = useWorkspaceTheme()
  const { reload } = useActiveWorkspace()
  const received = useReceivedInvitations({
    onUnauthorized,
    onAccepted: () => reload(),
  })

  return (
    <div
      className="app-shell flex min-h-svh flex-col bg-background text-foreground"
      data-theme={theme}
    >
      <AppHeader
        user={user}
        received={received}
        onLogout={onLogout}
        onUnauthorized={onUnauthorized}
        onUserUpdated={onUserUpdated}
      />

      <main className="app-content flex min-h-0 flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  )
}
