import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { listWorkspaces } from './api.js'
import { ALL_WORKSPACES, isAllWorkspacesScope } from './constants.js'

const ActiveWorkspaceContext = createContext(null)
ActiveWorkspaceContext.displayName = 'ActiveWorkspaceContext'

function storageKeyForUser(userId) {
  return `halgheh.activeWorkspace.${userId}`
}

function readStoredScope(userId) {
  if (!userId) return null
  try {
    const raw = window.localStorage.getItem(storageKeyForUser(userId))
    if (!raw) return null
    if (raw === ALL_WORKSPACES) return ALL_WORKSPACES
    const parsed = Number(raw)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  } catch {
    return null
  }
}

function writeStoredScope(userId, scope) {
  if (!userId) return
  try {
    if (scope == null) {
      window.localStorage.removeItem(storageKeyForUser(userId))
    } else {
      window.localStorage.setItem(storageKeyForUser(userId), String(scope))
    }
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
}

function isPersonalWorkspace(workspace) {
  return workspace?.workspace_type === 'personal'
}

function findPersonalWorkspace(workspaces) {
  if (!Array.isArray(workspaces)) return null
  return workspaces.find(isPersonalWorkspace) || workspaces[0] || null
}

function resolveWorkspaceScope(workspaces, storedScope) {
  if (!Array.isArray(workspaces) || workspaces.length === 0) return null
  if (isAllWorkspacesScope(storedScope)) return ALL_WORKSPACES
  if (storedScope != null) {
    const id = Number(storedScope)
    if (Number.isFinite(id) && workspaces.some((ws) => ws.id === id)) return id
  }
  const personal = findPersonalWorkspace(workspaces)
  return personal?.id ?? null
}

export function ActiveWorkspaceProvider({ user, children }) {
  const userId = user?.id ?? null
  const [workspaces, setWorkspaces] = useState([])
  const [status, setStatus] = useState('idle') // idle | loading | ready | error
  const [error, setError] = useState('')
  const [workspaceScope, setWorkspaceScopeState] = useState(null) // number | 'all' | null
  const requestRef = useRef(0)
  const userIdRef = useRef(userId)

  useEffect(() => {
    userIdRef.current = userId
  }, [userId])

  const load = useCallback(async (userIdArg, preferredScope) => {
    const currentUserId = userIdArg ?? userIdRef.current
    if (!currentUserId) {
      setWorkspaces([])
      setWorkspaceScopeState(null)
      setStatus('idle')
      setError('')
      return
    }

    const requestId = ++requestRef.current
    setStatus('loading')
    setError('')

    try {
      const data = await listWorkspaces({ limit: 100 })
      if (requestId !== requestRef.current) return
      if (userIdRef.current !== currentUserId) return

      const items = Array.isArray(data?.items) ? data.items : []
      const preferred = preferredScope == null ? null : preferredScope
      const storedScope = preferred ?? readStoredScope(currentUserId)
      const resolved = resolveWorkspaceScope(items, storedScope)

      setWorkspaces(items)
      setWorkspaceScopeState(resolved)
      writeStoredScope(currentUserId, resolved)
      setStatus('ready')
      return resolved
    } catch (err) {
      if (requestId !== requestRef.current) return
      if (userIdRef.current !== currentUserId) return
      setWorkspaces([])
      setWorkspaceScopeState(null)
      setStatus('error')
      setError(err?.message || 'Could not load workspaces.')
      return null
    }
  }, [])

  // Reset and reload when the authenticated user changes.
  useEffect(() => {
    requestRef.current += 1
    setWorkspaces([])
    setWorkspaceScopeState(null)
    setError('')
    if (!userId) {
      setStatus('idle')
      return
    }
    setStatus('loading')
    load(userId)
  }, [userId, load])

  const setWorkspaceScope = useCallback((nextScope) => {
    const currentUserId = userIdRef.current
    let normalized = nextScope
    if (isAllWorkspacesScope(nextScope)) {
      normalized = ALL_WORKSPACES
    } else if (nextScope == null) {
      normalized = null
    } else {
      const id = Number(nextScope)
      normalized = Number.isFinite(id) && id > 0 ? id : null
    }

    setWorkspaceScopeState((prev) => (prev === normalized ? prev : normalized))
    if (currentUserId) {
      writeStoredScope(currentUserId, normalized)
    }
  }, [])

  // Backward-compatible setter: accepts workspace id.
  const setActiveWorkspaceId = useCallback((nextId) => {
    setWorkspaceScope(nextId)
  }, [setWorkspaceScope])

  const isAllWorkspaces = isAllWorkspacesScope(workspaceScope)
  const activeWorkspaceId = isAllWorkspaces ? null : workspaceScope

  const activeWorkspace = useMemo(() => {
    if (activeWorkspaceId == null) return null
    return workspaces.find((ws) => ws.id === activeWorkspaceId) || null
  }, [workspaces, activeWorkspaceId])

  const personalWorkspace = useMemo(
    () => findPersonalWorkspace(workspaces),
    [workspaces],
  )
  const personalWorkspaceId = personalWorkspace?.id ?? null

  // Creation destination: specific workspace when scoped, personal workspace in All Workspaces mode.
  const defaultWorkspaceId = isAllWorkspaces ? personalWorkspaceId : activeWorkspaceId

  const reload = useCallback((preferredScope) => load(undefined, preferredScope), [load])

  const value = useMemo(
    () => ({
      workspaces,
      status,
      error,
      workspaceScope,
      isAllWorkspaces,
      activeWorkspaceId,
      activeWorkspace,
      personalWorkspace,
      personalWorkspaceId,
      defaultWorkspaceId,
      setWorkspaceScope,
      setActiveWorkspaceId,
      reload,
      isReady: status === 'ready' && workspaceScope != null,
    }),
    [
      workspaces,
      status,
      error,
      workspaceScope,
      isAllWorkspaces,
      activeWorkspaceId,
      activeWorkspace,
      personalWorkspace,
      personalWorkspaceId,
      defaultWorkspaceId,
      setWorkspaceScope,
      setActiveWorkspaceId,
      reload,
    ],
  )

  return (
    <ActiveWorkspaceContext.Provider value={value}>
      {children}
    </ActiveWorkspaceContext.Provider>
  )
}

export function useActiveWorkspace() {
  const ctx = useContext(ActiveWorkspaceContext)
  if (!ctx) {
    throw new Error('useActiveWorkspace must be used within ActiveWorkspaceProvider')
  }
  return ctx
}
