import { useMemo, useState } from 'react'
import { TASK_NAV_ITEMS } from '../utils/taskConstants.js'

const DEFAULT_FILTERS = {
  q: '',
  status: '',
  priority: '',
  due: '',
  sort: 'updated_at',
  order: 'desc',
}

const DEFAULT_LIMIT = 20

export default function useTaskFilters() {
  const [activeNavId, setActiveNavId] = useState(TASK_NAV_ITEMS[0].id)
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [offset, setOffset] = useState(0)
  const [limit, setLimit] = useState(DEFAULT_LIMIT)

  const activeNav = useMemo(
    () => TASK_NAV_ITEMS.find((item) => item.id === activeNavId) || TASK_NAV_ITEMS[0],
    [activeNavId],
  )

  function updateFilters(next) {
    setFilters(next)
    setOffset(0)
  }

  function setFilter(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setOffset(0)
  }

  function selectNav(item) {
    setActiveNavId(item.id)
    setOffset(0)
    setFilters((prev) => ({
      ...prev,
      status: item.status ? '' : prev.status,
      due: item.due ? '' : prev.due,
    }))
  }

  function nextPage(total) {
    setOffset((prev) => (prev + limit < total ? prev + limit : prev))
  }

  function prevPage() {
    setOffset((prev) => Math.max(0, prev - limit))
  }

  const query = useMemo(() => {
    const q = {
      sort: filters.sort || 'updated_at',
      order: filters.order || 'desc',
      limit,
      offset,
    }
    // Prefer backend-supported scopes; "My Tasks" and "Assigned by Me" nav map to scopes.
    q.scope = activeNav.scope || 'visible'
    if (filters.q?.trim()) q.q = filters.q.trim()
    if (filters.priority) q.priority = filters.priority
    if (activeNav.status) q.status = activeNav.status
    else if (filters.status) q.status = filters.status
    if (activeNav.due) q.due = activeNav.due
    else if (filters.due) q.due = filters.due
    return q
  }, [activeNav, filters, limit, offset])

  return {
    activeNavId,
    activeNav,
    filters,
    limit,
    offset,
    query,
    setLimit: (next) => { setLimit(next); setOffset(0) },
    setOffset,
    setFilters: updateFilters,
    setFilter,
    selectNav,
    nextPage,
    prevPage,
    resetPagination: () => setOffset(0),
  }
}
