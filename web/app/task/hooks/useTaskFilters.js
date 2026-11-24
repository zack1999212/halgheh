import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  DUE_FILTERS,
  ORDER_OPTIONS,
  SORT_OPTIONS,
  TASK_NAV_ITEMS,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '../utils/taskConstants.js'

const DEFAULT_FILTERS = {
  q: '',
  status: '',
  priority: '',
  due: '',
  sort: 'updated_at',
  order: 'desc',
}

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

const VALID_NAV_IDS = new Set(TASK_NAV_ITEMS.map((item) => item.id))
const VALID_STATUS = new Set(TASK_STATUSES.map((item) => item.id))
const VALID_PRIORITY = new Set(TASK_PRIORITIES.map((item) => item.id))
const VALID_DUE = new Set(DUE_FILTERS.map((item) => item.id).filter(Boolean))
const VALID_SORT = new Set(SORT_OPTIONS.map((item) => item.id))
const VALID_ORDER = new Set(ORDER_OPTIONS.map((item) => item.id))

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function parseLimit(value) {
  const parsed = parsePositiveInt(value, DEFAULT_LIMIT)
  return Math.min(Math.max(parsed, 1), MAX_LIMIT)
}

function parsePage(value) {
  return parsePositiveInt(value, 1)
}

function normalizeFilters(searchParams) {
  const status = searchParams.get('status') || ''
  const priority = searchParams.get('priority') || ''
  const due = searchParams.get('due') || ''
  const sort = searchParams.get('sort') || DEFAULT_FILTERS.sort
  const order = searchParams.get('order') || DEFAULT_FILTERS.order
  return {
    q: searchParams.get('q') || '',
    status: VALID_STATUS.has(status) ? status : '',
    priority: VALID_PRIORITY.has(priority) ? priority : '',
    due: VALID_DUE.has(due) ? due : '',
    sort: VALID_SORT.has(sort) ? sort : DEFAULT_FILTERS.sort,
    order: VALID_ORDER.has(order) ? order : DEFAULT_FILTERS.order,
  }
}

export default function useTaskFilters({ projectId = null, projectMode = false, workspaceScope = null } = {}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const navItems = useMemo(
    () => (projectMode ? TASK_NAV_ITEMS.filter((i) => i.scope === 'visible') : TASK_NAV_ITEMS),
    [projectMode],
  )
  const defaultNavId = navItems[0]?.id || TASK_NAV_ITEMS[0].id

  const activeNavId = useMemo(() => {
    const nav = searchParams.get('nav') || defaultNavId
    return navItems.some((item) => item.id === nav) ? nav : defaultNavId
  }, [searchParams, navItems, defaultNavId])

  const activeNav = useMemo(
    () => navItems.find((item) => item.id === activeNavId) || navItems[0] || TASK_NAV_ITEMS[0],
    [activeNavId, navItems],
  )

  const filters = useMemo(() => normalizeFilters(searchParams), [searchParams])
  const limit = useMemo(() => parseLimit(searchParams.get('limit')), [searchParams])
  const page = useMemo(() => parsePage(searchParams.get('page')), [searchParams])
  const offset = (page - 1) * limit

  const updateParams = useCallback((mutate, options) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      mutate(next)
      return next
    }, options)
  }, [setSearchParams])

  const setFilters = useCallback((nextFilters, options) => {
    updateParams((next) => {
      const merged = { ...DEFAULT_FILTERS, ...nextFilters }
      if (merged.q?.trim()) next.set('q', merged.q.trim())
      else next.delete('q')
      if (merged.status) next.set('status', merged.status)
      else next.delete('status')
      if (merged.priority) next.set('priority', merged.priority)
      else next.delete('priority')
      if (merged.due) next.set('due', merged.due)
      else next.delete('due')
      if (merged.sort && merged.sort !== DEFAULT_FILTERS.sort) next.set('sort', merged.sort)
      else next.delete('sort')
      if (merged.order && merged.order !== DEFAULT_FILTERS.order) next.set('order', merged.order)
      else next.delete('order')
      next.delete('page')
    }, options)
  }, [updateParams])

  const setFilter = useCallback((key, value, options) => {
    setFilters({ ...filters, [key]: value }, options)
  }, [filters, setFilters])

  const selectNav = useCallback((item) => {
    updateParams((next) => {
      if (item.id && item.id !== TASK_NAV_ITEMS[0].id) next.set('nav', item.id)
      else next.delete('nav')
      // Nav presets own status/due when they define them; clear manual conflicting filters.
      if (item.status) next.delete('status')
      if (item.due) next.delete('due')
      next.delete('page')
    })
  }, [updateParams])

  const nextPage = useCallback((total) => {
    updateParams((next) => {
      const currentPage = parsePage(next.get('page'))
      const currentLimit = parseLimit(next.get('limit'))
      const currentOffset = (currentPage - 1) * currentLimit
      if (currentOffset + currentLimit < total) {
        const newPage = currentPage + 1
        if (newPage > 1) next.set('page', String(newPage))
        else next.delete('page')
      }
    }, { replace: true })
  }, [updateParams])

  const prevPage = useCallback(() => {
    updateParams((next) => {
      const currentPage = parsePage(next.get('page'))
      const newPage = Math.max(1, currentPage - 1)
      if (newPage > 1) next.set('page', String(newPage))
      else next.delete('page')
    }, { replace: true })
  }, [updateParams])

  const setLimit = useCallback((nextLimit) => {
    updateParams((next) => {
      const parsed = parseLimit(String(nextLimit))
      if (parsed !== DEFAULT_LIMIT) next.set('limit', String(parsed))
      else next.delete('limit')
      next.delete('page')
    }, { replace: true })
  }, [updateParams])

  const query = useMemo(() => {
    const q = {
      sort: filters.sort || 'updated_at',
      order: filters.order || 'desc',
      limit,
      offset,
    }
    q.scope = activeNav.scope || 'visible'
    if (filters.q?.trim()) q.q = filters.q.trim()
    if (filters.priority) q.priority = filters.priority
    if (activeNav.status) q.status = activeNav.status
    else if (filters.status) q.status = filters.status
    if (activeNav.due) q.due = activeNav.due
    else if (filters.due) q.due = filters.due
    if (projectId != null) q.project_id = projectId
    if (workspaceScope && workspaceScope !== 'all') q.workspace_id = workspaceScope
    return q
  }, [activeNav, filters, limit, offset, projectId, workspaceScope])

  return {
    activeNavId,
    activeNav,
    navItems,
    filters,
    limit,
    offset,
    query,
    setLimit,
    setOffset: () => {},
    setFilters,
    setFilter,
    selectNav,
    nextPage,
    prevPage,
    resetPagination: () => updateParams((next) => next.delete('page'), { replace: true }),
  }
}
