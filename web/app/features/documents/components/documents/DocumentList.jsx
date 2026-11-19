import {
  FileText,
  FilePlus2,
  MoreHorizontal,
  Pencil,
  Star,
  FolderInput,
  Trash2,
  RotateCcw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import IconButton from '@/components/shared/IconButton.jsx'
import EmptyState from '@/components/shared/EmptyState.jsx'
import ErrorState from '@/components/shared/ErrorState.jsx'
import { formatRelativeTime } from '../../utils/formatTime.js'

const EMPTY_COPY = {
  documents: {
    title: 'No documents here yet',
    description: 'Create your first document to start writing in this view.',
  },
  favorites: {
    title: 'No favorites yet',
    description: 'Star a document to keep it within quick reach.',
  },
  trash: {
    title: 'Trash is empty',
    description: 'Deleted documents stay restorable from here.',
  },
}

function DocumentRow({ document, mode, onOpen, actions, readOnly = false }) {
  return (
    <li>
      <div className="group/row flex items-center gap-2 rounded-md px-2 py-2 transition-colors hover:bg-accent">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-sm text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onClick={() => onOpen(document.id)}
        >
          <FileText
            size={15}
            aria-hidden="true"
            className="shrink-0 text-muted-foreground"
          />
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
            {document.title}
          </span>
          <span className="hidden shrink-0 text-[12px] text-muted-foreground sm:block">
            {formatRelativeTime(document.updated_at)}
          </span>
        </button>

        {!readOnly && mode !== 'trash' && actions.onToggleFavorite && (
          <IconButton
            label={
              document.is_favorite
                ? `Remove "${document.title}" from favorites`
                : `Add "${document.title}" to favorites`
            }
            className={cnFavorite(document.is_favorite)}
            onClick={() => actions.onToggleFavorite(document)}
          >
            <Star
              size={15}
              aria-hidden="true"
              className={document.is_favorite ? 'fill-current' : undefined}
            />
          </IconButton>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton label={`Actions for "${document.title}"`}>
              <MoreHorizontal size={16} aria-hidden="true" />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onSelect={() => onOpen(document.id)}>
              <FileText aria-hidden="true" />
              Open
            </DropdownMenuItem>
            {!readOnly && mode !== 'trash' && (
              <>
                {actions.onRename && (
                  <DropdownMenuItem onSelect={() => actions.onRename(document)}>
                    <Pencil aria-hidden="true" />
                    Rename
                  </DropdownMenuItem>
                )}
                {actions.onMove && (
                  <DropdownMenuItem onSelect={() => actions.onMove(document)}>
                    <FolderInput aria-hidden="true" />
                    Move to folder…
                  </DropdownMenuItem>
                )}
              </>
            )}
            {!readOnly && mode === 'trash' && actions.onRestore ? (
              <DropdownMenuItem onSelect={() => actions.onRestore(document)}>
                <RotateCcw aria-hidden="true" />
                Restore
              </DropdownMenuItem>
            ) : null}
            {!readOnly && mode !== 'trash' && actions.onTrash ? (
              <>
                {(actions.onRename || actions.onMove) ? <DropdownMenuSeparator /> : null}
                <DropdownMenuItem
                  className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                  onSelect={() => actions.onTrash(document)}
                >
                  <Trash2 aria-hidden="true" />
                  Move to trash
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  )
}

function cnFavorite(active) {
  return active ? 'text-foreground' : undefined
}

/**
 * Center-panel document list for the active sidebar view (workspace /
 * folder, favorites, trash or a search / tag filter).
 *
 * Row actions are limited to what the backend supports: rename, move,
 * favorite and soft-delete (with restore). The backend has no
 * "delete permanently" endpoint, so trashed documents stay restorable.
 */
export default function DocumentList({
  mode,
  heading,
  documentList,
  onCreate,
  onOpen,
  onToggleFavorite,
  onRename,
  onMove,
  onTrash,
  onRestore,
  readOnly = false,
}) {
  const documents = documentList.documents

  return (
    <section className="flex min-w-0 flex-1 flex-col" aria-label="Documents">
      <header className="flex flex-none flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold tracking-[-0.01em]">
            {heading}
          </h2>
          {documentList.status === 'ready' && (
            <p className="text-[12.5px] text-muted-foreground">
              {documents?.length ?? 0} of {documentList.total}{' '}
              {documentList.total === 1 ? 'document' : 'documents'}
            </p>
          )}
        </div>
        {!readOnly && mode !== 'trash' && (
          <Button type="button" size="sm" onClick={onCreate}>
            <FilePlus2 size={14} aria-hidden="true" />
            New document
          </Button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
        {documentList.status === 'loading' ? (
          <ul className="grid gap-1" role="status" aria-label="Loading documents">
            {[0, 1, 2, 3, 4].map((index) => (
              <li key={index} className="flex items-center gap-3 px-2 py-2">
                <Skeleton className="size-4 rounded-sm" />
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="ml-auto h-3 w-16" />
              </li>
            ))}
          </ul>
        ) : documentList.status === 'error' ? (
          <div className="p-4">
            <ErrorState
              title="Documents could not be loaded"
              message={documentList.error?.message}
              onRetry={documentList.reload}
            />
          </div>
        ) : documents?.length ? (
          <div className="grid gap-3">
            <ul className="grid gap-0.5">
              {documents.map((document) => (
                <DocumentRow
                  key={document.id}
                  document={document}
                  mode={mode}
                  readOnly={readOnly}
                  onOpen={onOpen}
                  actions={{
                    onToggleFavorite,
                    onRename,
                    onMove,
                    onTrash,
                    onRestore,
                  }}
                />
              ))}
            </ul>
            {documentList.hasMore && (
              <div className="flex justify-center pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={documentList.loadMore}
                  disabled={documentList.loadingMore}
                >
                  {documentList.loadingMore ? 'Loading…' : 'Load more'}
                </Button>
              </div>
            )}
            {documentList.loadingMore && !documentList.hasMore && null}
          </div>
        ) : (
          <EmptyState
            className="h-full justify-center"
            icon={mode === 'trash' ? Trash2 : mode === 'favorites' ? Star : FileText}
            title={readOnly && mode === 'documents' ? 'No documents yet' : EMPTY_COPY[mode].title}
            description={readOnly && mode === 'documents' ? 'No documents have been created for this project yet.' : EMPTY_COPY[mode].description}
          >
            {!readOnly && mode === 'documents' && (
              <Button type="button" size="sm" className="mx-auto" onClick={onCreate}>
                <FilePlus2 size={14} aria-hidden="true" />
                New document
              </Button>
            )}
          </EmptyState>
        )}
      </div>
    </section>
  )
}
