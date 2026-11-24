import { useContext } from 'react'
import { WorkspaceThemeContext } from '../WorkspaceThemeProvider.jsx'

/**
 * Reads the app-wide theme owned by WorkspaceThemeProvider. Every consumer
 * (workspace page toggle, global header, portaled workspace dialogs) shares
 * the same state, so one toggle recolours all of them.
 */
export function useWorkspaceTheme() {
  const ctx = useContext(WorkspaceThemeContext)
  if (!ctx) {
    throw new Error('useWorkspaceTheme must be used within WorkspaceThemeProvider')
  }
  return ctx
}