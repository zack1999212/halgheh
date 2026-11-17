import * as React from 'react'

/**
 * Halgheh breakpoint for the compact application navigation.
 *
 * The previous shell switched to a drawer below 1024px, so the shadcn sidebar
 * uses the same breakpoint: below it the sidebar renders as a Sheet, above it
 * it stays docked and can collapse to icons.
 */
const MOBILE_BREAKPOINT = 1024

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(() => {
    if (typeof window === 'undefined') {
      return false
    }
    return window.innerWidth < MOBILE_BREAKPOINT
  })

  React.useEffect(() => {
    const query = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)

    query.addEventListener('change', onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)

    return () => query.removeEventListener('change', onChange)
  }, [])

  return isMobile
}
