import { useEffect, useState } from 'react'
import {
  FileText,
  Plus,
  Search,
  Star,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import IconButton from '@/components/shared/IconButton.jsx'
import ErrorState from '@/components/shared/ErrorState.jsx'
import WorkspaceCreateDialog from './workspace/WorkspaceCreateDialog.jsx'
import FolderTree from './folders/FolderTree.jsx'
import { cn } from '@/lib/utils'

const VIEWS = [
  { id: 'documents', label: 'All documents', icon: FileText },
  { id: 'favorites', label: 'Favorites', icon: Star },
  { id: 'trash', label: 'Trash', icon: Trash2 },
]

function TagDot({ color }) {
  return (
    <span
      aria-hidden="true"
      className="size-2.5 shrink-0 rounded-full border border-black/10"
      style={{ backgroundColor: color }}
    />
  )
}

/**
 * Left sidebar: workspace selector, search, view navigation (documents /
 * favorites / trash), tag filters and the folder tree.
 *
 * The search field debounces its input so typing does not fire one API
 * request per keystroke.
 */
export default function LeftSidebar({
  workspaces,
  activeWorkspaceId,
  onWorkspaceChange,
  onCreateWorkspace,
  query,
  onQueryChange,
  mode,
  onModeChange,
  tags,
  activeTagId,
  onTagChange,
  folderTree,
  activeFolderId,
  onFolderSelect,
  onFolderCreate,
  onFolderRename,
  onFolderDelete,
  onCreateDocument,
  className,
}) {
  const [searchValue, setSearchValue] = useState(query)
  const [creatingWorkspace, setCreatingWorkspace] = useState(false)

  // Keep the input in sync when the view resets (workspace change etc.).
  useEffect(() => {
    if (query === null && searchValue !== '') {
      setSearchValue('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  // Debounce the search input before it becomes an API query.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      onQueryChange(searchValue.trim() || null)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchValue, onQueryChange])

  return (
    <aside
      className={cn(
        'flex w-[284px] flex-none flex-col border-r border-border bg-background max-sm:w-[250px]',
        className,
      )}
      aria-label="Document library"
    >
      {/* Workspace selector */}
      <div className="flex flex-none items-center gap-1 px-3 py-3">
        <Select
          value={activeWorkspaceId ? String(activeWorkspaceId) : undefined}
          onValueChange={(value) => onWorkspaceChange(Number(value))}
        >
          <SelectTrigger
            aria-label="Active workspace"
            className="h-8 flex-1 border-transparent bg-transparent px-2 text-[13px] font-semibold shadow-none hover:border-border hover:bg-card data-[state=open]:border-border"
          >
            <SelectValue
              placeholder={
                workspaces.status === 'loading'
                  ? 'Loading…'
                  : workspaces.status === 'error'
                    ? 'Could not load workspaces'
                    : 'No workspace'
              }
            />
          </SelectTrigger>
          <SelectContent>
            {(workspaces.data || []).map((workspace) => (
              <SelectItem key={workspace.id} value={String(workspace.id)}>
                {workspace.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <IconButton
          label="New workspace"
          onClick={() => setCreatingWorkspace(true)}
        >
          <Plus size={15} aria-hidden="true" />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto pb-6">
        {workspaces.status === 'error' && (
          <div className="px-3 py-2">
            <ErrorState
              title="Workspaces could not be loaded"
              message={workspaces.error?.message}
              onRetry={workspaces.reload}
              className="py-1 text-[12px]"
            />
          </div>
        )}
        {/* Search */}
        <div className="px-3 py-2">
          <div className="relative">
            <Search
              size={14}
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search documents…"
              aria-label="Search documents"
              className="h-8 bg-card pl-8 text-[13px]"
            />
          </div>
        </div>

        {/* Views */}
        <nav aria-label="Document views" className="px-2 py-2">
          <ul className="grid gap-0.5">
            {VIEWS.map((view) => {
              const active = mode === view.id
              return (
                <li key={view.id}>
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                      active
                        ? 'bg-accent font-medium text-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => onModeChange(view.id)}
                  >
                    <view.icon size={14} aria-hidden="true" className="shrink-0" />
                    {view.label}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Tags */}
        <section aria-label="Filter by tag" className="px-3 py-2">
          <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Tags
          </h3>
          {tags.status === 'loading' ? (
            <div className="grid gap-2 py-1" role="status" aria-label="Loading tags">
              <div className="h-2.5 w-2/3 animate-pulse rounded-md bg-primary/10" />
              <div className="h-2.5 w-1/2 animate-pulse rounded-md bg-primary/10" />
            </div>
          ) : tags.status === 'error' ? (
            <ErrorState
              message="Tags could not be loaded."
              onRetry={tags.reload}
              className="py-1 text-[12px]"
            />
          ) : tags.data?.length ? (
            <ul className="grid gap-0.5">
              {tags.data.map((tag) => {
                const active = activeTagId === tag.id
                return (
                  <li key={tag.id}>
                    <button
                      type="button"
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                        active
                          ? 'bg-accent font-medium text-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                      aria-pressed={active}
                      onClick={() => onTagChange(active ? null : tag.id)}
                    >
                      <TagDot color={tag.color} />
                      <span className="truncate">{tag.name}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="py-1 text-[12px] text-muted-foreground">No tags yet.</p>
          )}
        </section>

        {/* Folders */}
        <section aria-label="Folders" className="px-2 py-2">
          <h3 className="mb-1 px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Folders
          </h3>
          <FolderTree
            tree={folderTree}
            activeFolderId={activeFolderId}
            onSelect={onFolderSelect}
            onCreate={onFolderCreate}
            onRename={onFolderRename}
            onDelete={onFolderDelete}
          />
        </section>
      </div>

      <div className="flex-none border-t border-border p-3">
        <Button
          type="button"
          size="sm"
          className="w-full justify-center"
          onClick={onCreateDocument}
          disabled={mode === 'trash'}
        >
          <FileText size={14} aria-hidden="true" />
          New document
        </Button>
      </div>

      <WorkspaceCreateDialog
        open={creatingWorkspace}
        onClose={() => setCreatingWorkspace(false)}
        onCreate={onCreateWorkspace}
      />
    </aside>
  )
}
