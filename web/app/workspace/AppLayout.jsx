import { useCallback, useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { getCurrentUser, clearSession } from '../auth/api.js'
import { NAV_ITEMS, findNavItem } from './navigation.js'
import Sidebar from './components/Sidebar.jsx'
import AppHeader from './components/AppHeader.jsx'
import './shell.css'

export default function AppLayout() {
  const [user, setUser] = useState(null)
  const [navOpen, setNavOpen] = useState(false)
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

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setNavOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!navOpen) {
      return undefined
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setNavOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [navOpen])

  const activeItem = findNavItem(location.pathname)

  return (
    <div className="app-shell">
      <Sidebar items={NAV_ITEMS} open={navOpen} />

      {navOpen && (
        <button
          type="button"
          className="app-nav-overlay"
          onClick={() => setNavOpen(false)}
          aria-label="Close navigation"
        />
      )}

      <div className="app-main">
        <AppHeader
          title={activeItem?.label || 'Halgheh'}
          user={user}
          onOpenNavigation={() => setNavOpen(true)}
          onLogout={handleLogout}
          onUnauthorized={handleUnauthorized}
        />

        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
