import { useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import IconButton from '@/components/shared/IconButton.jsx'
import ConfirmDialog from '@/components/shared/ConfirmDialog.jsx'
import { cn } from '@/lib/utils'
import FolderDialog from './FolderDialog.jsx'

/**
 * Recursive folder tree of the active workspace.
 *
 * Selecting a folder filters the document list; the "⋯" menu offers create
 * subfolder / rename / delete. Deleting a folder never deletes documents —
 * the backend moves them to the workspace root (reported by the hook).
 */
function FolderNodeRow({ node, depth, activeFolderId, onSelect, actions }) {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = node.children?.length > 0
  const isActive = activeFolderId === node.id

  return (
    <li>
      <div
        className={cn(
          'group/row flex items-center gap-0.5 rounded-md pr-1 transition-colors hover:bg-accent',
          isActive && 'bg-accent',
        )}
        style={{ paddingLeft: depth * 12 }}
      >
        <button
          type="button"
          className={cn(
            'grid size-5 shrink-0 place-items-center rounded text-muted-foreground',
            !hasChildren && 'invisible',
          )}
          onClick={() => setExpanded((value) => !value)}
          aria-label={expanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown size={13} aria-hidden="true" />
          ) : (
            <ChevronRight size={13} aria-hidden="true" />
          )}
        </button>

        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-1 pr-1 text-left text-[13px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onClick={() => onSelect(node.id)}
          aria-current={isActive ? 'true' : undefined}
        >
          <Folder
            size={14}
            aria-hidden="true"
            className={cn('shrink-0 text-muted-foreground', isActive && 'text-foreground')}
          />
          <span className="truncate">{node.name}</span>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <span className="opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100 data-[open]:opacity-100">
              <IconButton label={`Actions for ${node.name}`} className="size-6">
                <MoreHorizontal size={14} aria-hidden="true" />
              </IconButton>
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onSelect={() => actions.onCreateChild(node)}>
              <FolderPlus aria-hidden="true" />
              New subfolder
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => actions.onRename(node)}>
              <Pencil aria-hidden="true" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
              onSelect={() => actions.onDelete(node)}
            >
              <Trash2 aria-hidden="true" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {hasChildren && expanded && (
        <ul className="min-w-0">
          {node.children.map((child) => (
            <FolderNodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              activeFolderId={activeFolderId}
              onSelect={onSelect}
              actions={actions}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

/**
 * The folder tree itself stays dumb; all dialogs and mutations live in
 * `FolderTreeSection` so the recursion stays simple.
 */
export default function FolderTree({
  tree,
  activeFolderId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}) {
  const [dialog, setDialog] = useState(null) // { mode: 'create'|'rename', folder, parent }
  const [pendingDelete, setPendingDelete] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function openCreate(parent = null) {
    setError('')
    setDialog({ mode: 'create', parent })
  }

  function openRename(folder) {
    setError('')
    setDialog({ mode: 'rename', folder })
  }

  async function handleSubmit({ name }) {
    setBusy(true)
    setError('')
    try {
      if (dialog.mode === 'create') {
        await onCreate({ parentId: dialog.parent?.id ?? null, name })
      } else {
        await onRename(dialog.folder.id, name)
      }
      setDialog(null)
    } catch (caught) {
      setError(caught.message || 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return
    setBusy(true)
    setError('')
    try {
      await onDelete(pendingDelete)
      setPendingDelete(null)
    } catch (caught) {
      setError(caught.message || 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-1">
      {tree.status === 'loading' ? (
        <div className="grid gap-2 px-1 py-1" role="status" aria-label="Loading folders">
          <div className="h-2.5 w-full animate-pulse rounded-md bg-primary/10" />
          <div className="h-2.5 w-2/3 animate-pulse rounded-md bg-primary/10" />
        </div>
      ) : tree.status === 'error' ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 justify-start text-[12.5px] text-muted-foreground"
          onClick={tree.reload}
        >
          Folders could not load. Click to retry.
        </Button>
      ) : tree.data?.items?.length ? (
        <ul className="min-w-0">
          {tree.data.items.map((node) => (
            <FolderNodeRow
              key={node.id}
              node={node}
              depth={0}
              activeFolderId={activeFolderId}
              onSelect={onSelect}
              actions={{
                onCreateChild: openCreate,
                onRename: openRename,
                onDelete: setPendingDelete,
              }}
            />
          ))}
        </ul>
      ) : (
        <p className="px-1 py-1 text-[12px] text-muted-foreground">No folders yet.</p>
      )}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 w-fit justify-start gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"
        onClick={() => openCreate(null)}
      >
        <FolderPlus size={13} aria-hidden="true" />
        New folder
      </Button>

      <FolderDialog
        open={Boolean(dialog)}
        folder={dialog?.mode === 'rename' ? dialog.folder : null}
        parentName={dialog?.parent?.name}
        busy={busy}
        error={error}
        onClose={() => setDialog(null)}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={`Delete "${pendingDelete?.name || ''}"?`}
        description="The folder and its subfolders are removed. Documents inside stay and move to the workspace root."
        confirmLabel="Delete folder"
        busy={busy}
        busyLabel="Deleting…"
        error={error}
        onConfirm={handleDelete}
        onClose={() => {
          if (!busy) {
            setPendingDelete(null)
            setError('')
          }
        }}
      />
    </div>
  )
}
