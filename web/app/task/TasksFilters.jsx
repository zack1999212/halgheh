import { useEffect, useRef, useState } from 'react'
import { Search, SlidersHorizontal } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import WorkspaceScopeSelect from '../workspace/components/WorkspaceScopeSelect.jsx'
import { DUE_FILTERS, ORDER_OPTIONS, SORT_OPTIONS, TASK_PRIORITIES, TASK_STATUSES } from './utils/taskConstants.js'

const ALL = '__all__'
const SEARCH_DEBOUNCE_MS = 300

export default function TasksFilters({
  filters,
  onChange,
  view = 'list',
  workspaceScope,
  onWorkspaceScopeChange,
  workspaces = [],
}) {
  const [searchValue, setSearchValue] = useState(filters.q || '')
  const searchTimerRef = useRef(null)
  const latestFiltersRef = useRef(filters)

  useEffect(() => {
    latestFiltersRef.current = filters
  }, [filters])

  useEffect(() => {
    setSearchValue(filters.q || '')
  }, [filters.q])

  useEffect(() => () => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
  }, [])

  function set(key, value, options) {
    onChange({ ...filters, [key]: value }, options)
  }

  function handleSearchChange(event) {
    const nextValue = event.target.value
    setSearchValue(nextValue)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      onChange({ ...latestFiltersRef.current, q: nextValue }, { replace: true })
    }, SEARCH_DEBOUNCE_MS)
  }

  return (
    <section className="tasks-filters grid gap-3" aria-label="Task filters">
      <div className="flex items-center gap-2 text-[13px] font-semibold">
        <SlidersHorizontal size={15} aria-hidden="true" className="text-muted-foreground" />
        Search and filters
      </div>

      <div className={`grid gap-3 md:grid-cols-2 ${view === 'kanban' ? 'xl:grid-cols-5' : 'xl:grid-cols-6'}`}>
        {onWorkspaceScopeChange ? (
          <div className="grid gap-1.5">
            <Label htmlFor="task-workspace-scope" className="text-[12.5px]">Workspace</Label>
            <WorkspaceScopeSelect
              value={workspaceScope}
              onValueChange={onWorkspaceScopeChange}
              workspaces={workspaces}
              triggerClassName="h-9 w-full"
              ariaLabel="Filter tasks by workspace"
            />
          </div>
        ) : null}
        <div className="grid gap-1.5 xl:col-span-2">
          <Label htmlFor="task-search" className="text-[12.5px]">Search</Label>
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id="task-search"
              value={searchValue}
              onChange={handleSearchChange}
              placeholder="Search title or description"
              className="h-9 pl-8"
            />
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="task-status-filter" className="text-[12.5px]">Status</Label>
          <Select value={filters.status || ALL} onValueChange={(v) => set('status', v === ALL ? '' : v)}>
            <SelectTrigger id="task-status-filter" className="h-9" aria-label="Filter by status">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {TASK_STATUSES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="task-priority-filter" className="text-[12.5px]">Priority</Label>
          <Select value={filters.priority || ALL} onValueChange={(v) => set('priority', v === ALL ? '' : v)}>
            <SelectTrigger id="task-priority-filter" className="h-9" aria-label="Filter by priority">
              <SelectValue placeholder="All priorities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All priorities</SelectItem>
              {TASK_PRIORITIES.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="task-due-filter" className="text-[12.5px]">Due</Label>
          <Select value={filters.due || ALL} onValueChange={(v) => set('due', v === ALL ? '' : v)}>
            <SelectTrigger id="task-due-filter" className="h-9" aria-label="Filter by due date">
              <SelectValue placeholder="Any due date" />
            </SelectTrigger>
            <SelectContent>
              {DUE_FILTERS.map((d) => <SelectItem key={d.id || ALL} value={d.id || ALL}>{d.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {view !== 'kanban' ? (
          <div className="grid gap-1.5">
            <Label htmlFor="task-sort" className="text-[12.5px]">Sort</Label>
            <div className="grid grid-cols-2 gap-2">
              <Select value={filters.sort} onValueChange={(v) => set('sort', v)}>
                <SelectTrigger id="task-sort" className="h-9" aria-label="Sort by">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filters.order} onValueChange={(v) => set('order', v)}>
                <SelectTrigger id="task-order" className="h-9" aria-label="Sort order">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORDER_OPTIONS.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : null}
      </div>

      <p className="text-[12px] text-muted-foreground">
        Assignee, label, and subtask-progress details are shown when provided by task detail responses; the list API returns task summaries.
      </p>
    </section>
  )
}
