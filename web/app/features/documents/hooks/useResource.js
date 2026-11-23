import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Small fetch-state helper shared by the documents hooks.
 *
 * status: 'loading' (first load) | 'ready' | 'error'. Refetches keep the
 * previous data on screen until the fresh response arrives. Each load is
 * cancelled on unmount or when its dependencies change, so stale responses
 * never overwrite newer ones.
 *
 * `loader` must return a promise; `deps` follows the useEffect rules.
 */
export function useResource(loader, deps) {
  const [state, setState] = useState({
    status: 'loading',
    data: null,
    error: null,
  })

  // Always read the freshest loader without making `load` unstable.
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  const load = useCallback(() => {
    let cancelled = false
    // Clear previous data so callers never observe a stale payload from a
    // different dependency set (for example when switching documents). This
    // prevents a previous document's draft from being saved against a new id.
    setState({ status: 'loading', data: null, error: null })
    loaderRef
      .current()
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data, error: null })
      })
      .catch((error) => {
        if (!cancelled) setState({ status: 'error', data: null, error })
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => load(), [load])

  const setData = useCallback((updater) => {
    setState((current) => {
      const nextData =
        typeof updater === 'function' ? updater(current.data) : updater
      return { ...current, status: 'ready', data: nextData, error: null }
    })
  }, [])

  return { ...state, reload: load, setData }
}
