import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'halgheh:documents-theme'

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
 * Light/dark theme for the documents feature.
 *
 * The value is applied as `data-theme` on the feature root by the page and
 * persisted per browser. Tokens are scoped with `--docs-*` prefixes inside
 * documents.css, so no other page changes appearance.
 */
export function useTheme() {
  const [theme, setTheme] = useState(getInitialTheme)

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // Persisting is best-effort only.
    }
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }, [])

  return { theme, setTheme, toggleTheme }
}
