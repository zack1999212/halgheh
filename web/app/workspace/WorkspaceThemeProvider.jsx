import { createContext, useCallback, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'halgheh:workspace-theme'

export const WorkspaceThemeContext = createContext(null)

function getInitialTheme() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // Storage can be unavailable (private mode); fall through to the
    // system preference.
  }
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  return 'light'
}

/**
 * App-wide owner of the light/dark choice. The workspace page toggle and the
 * global header both read this state, so switching the page theme also
 * recolours the top bar instead of only the dashboard surface.
 */
export function WorkspaceThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme)

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // Persisting is best-effort only.
    }
  }, [theme])

  // Portaled shadcn menus (workspace selector, profile) live outside the app
  // shell, so they need the global `.dark` token block as well. The shell and
  // page scopes override it with the dashboard's warmer palette.
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    return () => root.classList.remove('dark')
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }, [])

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, toggleTheme],
  )

  return (
    <WorkspaceThemeContext.Provider value={value}>
      {children}
    </WorkspaceThemeContext.Provider>
  )
}