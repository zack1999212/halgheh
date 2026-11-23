import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Library, PanelRight, X } from 'lucide-react'
import { updateDocument as updateDocumentRequest } from './api/client.js'
import { useDocument } from './hooks/useDocument.js'
import { useDocumentLinks } from './hooks/useDocumentLinks.js'
import { useDocumentList } from './hooks/useDocumentList.js'
import { useFolderTree } from './hooks/useFolderTree.js'
import { useTags } from './hooks/useTags.js'
import { useWorkspaces } from './hooks/useWorkspaces.js'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import ConfirmDialog from '@/components/shared/ConfirmDialog.jsx'
import ErrorState from '@/components/shared/ErrorState.jsx'
import IconButton from '@/components/shared/IconButton.jsx'
import { useToast } from '@/components/shared/ToastProvider.jsx'
import LeftSidebar from './components/LeftSidebar.jsx'
import DocumentList from './components/documents/DocumentList.jsx'
import CreateDocumentDialog from './components/documents/CreateDocumentDialog.jsx'
import RenameDocumentDialog from './components/documents/RenameDocumentDialog.jsx'
import MoveDocumentDialog from './components/documents/MoveDocumentDialog.jsx'
import DocumentEditor from './components/editor/DocumentEditor.jsx'
import PropertiesPanel from './components/properties/PropertiesPanel.jsx'
import DocumentGraph from './components/graph/DocumentGraph.jsx'

/** Depth-first search for a folder name inside the tree. */
function findFolderName(nodes, folderId) {
  for (const node of nodes || []) {
    if (node.id === folderId) return node.name
    const found = findFolderName(node.children, folderId)
    if (found) return found
  }
  return null
}

function buildFolderNameMap(nodes, map = {}) {
  for (const node of nodes || []) {
    map[node.id] = node.name
    if (node.children?.length) buildFolderNameMap(node.children, map)
  }
  return map
}

/** True when a folder id exists anywhere inside the tree. */
function folderExists(nodes, folderId) {
  for (const node of nodes || []) {
    if (node.id === folderId) return true
    if (folderExists(node.children, folderId)) return true
  }
  return false
}

/** True when `targetId` is the node or inside its descendants. */
function containsFolder(node, targetId) {
  if (!node || targetId == null) return false
  if (node.id === targetId) return true
  for (const child of node.children || []) {
    if (containsFolder(child, targetId)) return true
  }
  return false
}

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const media = window.matchMedia(query)
    const onChange = (event) => setMatches(event.matches)
    setMatches(media.matches)
    if (media.addEventListener) {
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    }
    media.addListener(onChange)
    return () => media.removeListener(onChange)
  }, [query])

  return matches
}

/**
 * Document Management screen: three-pane layout inside the app shell.
 *
 *   left   — workspaces, search, view navigation, tag filters, folder tree
 *   center — document list (no document open) or the Markdown editor
 *   right  — properties, tags, related links and backlinks (when open)
 *
 * Routes (see src/App.jsx): /documents and /documents/:documentId.
 */
function parsePositiveInt(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

function parseTagIds(value) {
  if (!value) return []
  return String(value)
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
}

export default function DocumentsPage() {
  const { documentId } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const toast = useToast()
  const activeDocumentId = documentId ? Number(documentId) : null
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const isWide = useMediaQuery('(min-width: 1280px)')

  // ------------------------------------------------------------- data hooks
  const workspaces = useWorkspaces()
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(
    () => parsePositiveInt(searchParams.get('vault')),
  )

  useEffect(() => {
    if (workspaces.status !== 'ready') return
    const items = workspaces.data || []
    if (!items.length) return
    if (items.some((workspace) => workspace.id === activeWorkspaceId)) return
    const urlVault = parsePositiveInt(searchParams.get('vault'))
    if (urlVault && items.some((workspace) => workspace.id === urlVault)) {
      setActiveWorkspaceId(urlVault)
      return
    }
    setActiveWorkspaceId(items[0].id)
  }, [workspaces.status, workspaces.data, activeWorkspaceId, searchParams])

  const VALID_MODES = new Set(['documents', 'favorites', 'trash', 'graph', 'archived'])
  const initialMode = searchParams.get('mode')
  const [mode, setMode] = useState(
    VALID_MODES.has(initialMode) ? initialMode : 'documents',
  )
  const [activeFolderId, setActiveFolderId] = useState(
    () => parsePositiveInt(searchParams.get('folder')),
  )
  const [query, setQuery] = useState(() => searchParams.get('q') || null)
  const [activeTagIds, setActiveTagIds] = useState(
    () => parseTagIds(searchParams.get('tags')),
  )

  // Keep URL as source of truth for refresh/deep links.
  useEffect(() => {
    const next = new URLSearchParams(searchParams)
    const setOrDelete = (key, value) => {
      if (value === null || value === undefined || value === '' || value === false) next.delete(key)
      else next.set(key, String(value))
    }
    setOrDelete('vault', activeWorkspaceId)
    setOrDelete('mode', mode !== 'documents' ? mode : null)
    setOrDelete('folder', activeFolderId)
    setOrDelete('tags', activeTagIds.length ? activeTagIds.join(',') : null)
    setOrDelete('q', query?.trim() ? query.trim() : null)
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true })
    }
  }, [activeWorkspaceId, mode, activeFolderId, activeTagIds, query, searchParams, setSearchParams])

  const folderTree = useFolderTree(activeWorkspaceId)
  const tags = useTags(activeWorkspaceId)
  const folderNameById = useMemo(
    () => buildFolderNameMap(folderTree.data?.items),
    [folderTree.data],
  )
  const documentList = useDocumentList({
    workspaceId: activeWorkspaceId,
    folderId: activeFolderId,
    query,
    tagIds: activeTagIds,
    mode,
  })

  const document = useDocument(activeDocumentId)
  const links = useDocumentLinks(activeDocumentId)

  const handleUpdateTag = useCallback(
    async (tagId, patch) => {
      await tags.update(tagId, patch)
      document.reload()
      documentList.reload()
    },
    [tags, document, documentList],
  )

  const handleDeleteTag = useCallback(
    async (tagId) => {
      await tags.remove(tagId)
      setActiveTagIds((current) => current.filter((id) => id !== tagId))
      document.reload()
      documentList.reload()
    },
    [tags, document, documentList],
  )

  // ------------------------------------------------------------ UI state
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [actionNotice, setActionNotice] = useState('')

  const reportActionError = useCallback((caught, fallback) => {
    const message = caught?.message || fallback || 'Something went wrong.'
    setActionNotice(message)
    toast.error(message)
  }, [toast])

  useEffect(() => {
    if (!actionNotice) return undefined
    const timer = window.setTimeout(() => setActionNotice(''), 5000)
    return () => window.clearTimeout(timer)
  }, [actionNotice])

  // ------------------------------------------------------------ navigation
  const openDocument = useCallback(
    (id) => {
      setActionNotice('')
      const search = searchParams.toString()
      navigate(`/documents/${id}${search ? `?${search}` : ''}`)
      setLibraryOpen(false)
    },
    [navigate, searchParams],
  )
  const closeDocument = useCallback(() => {
    const search = searchParams.toString()
    navigate(`/documents${search ? `?${search}` : ''}`)
    setDetailsOpen(false)
  }, [navigate, searchParams])

  function resetViewFilters() {
    setMode('documents')
    setActiveFolderId(null)
    setActiveTagIds([])
    setQuery(null)
  }

  function handleWorkspaceChange(id) {
    setActiveWorkspaceId(id)
    resetViewFilters()
    setActionNotice('')
    if (activeDocumentId) {
      closeDocument()
    }
  }

  function handleFolderSelect(folderId) {
    setMode('documents')
    setActiveTagIds([])
    // Clicking the active folder again returns to the whole workspace.
    setActiveFolderId((current) => (current === folderId ? null : folderId))
    setLibraryOpen(false)
    if (activeDocumentId) {
      closeDocument()
    }
  }

  function handleModeChange(next) {
    setMode(next)
    setActiveFolderId(null)
    setActiveTagIds([])
    setLibraryOpen(false)
    if (activeDocumentId) {
      closeDocument()
    }
  }

  function handleTagFilterChange(tagIds) {
    const next = Array.isArray(tagIds) ? tagIds : tagIds ? [tagIds] : []
    setActiveTagIds(next)
    setActiveFolderId(null)
    setMode('documents')
    setLibraryOpen(false)
    if (activeDocumentId) {
      closeDocument()
    }
  }

  // Clear selection if the active folder disappears from the tree.
  useEffect(() => {
    if (activeFolderId == null) return
    if (folderTree.status !== 'ready') return
    if (folderExists(folderTree.data?.items, activeFolderId)) return
    setActiveFolderId(null)
  }, [activeFolderId, folderTree.status, folderTree.data])

  const lastListErrorRef = useRef('')
  useEffect(() => {
    if (documentList.status !== 'error') { lastListErrorRef.current = ''; return }
    const msg = documentList.error?.message || 'Could not load documents.'
    if (lastListErrorRef.current === msg) return
    lastListErrorRef.current = msg
    toast.error(msg)
  }, [documentList.status, documentList.error, toast])

  // ------------------------------------------------------ list heading text
  const listHeading = useMemo(() => {
    if (mode === 'favorites') return 'Favorites'
    if (mode === 'trash') return 'Trash'
    if (query) return `Search: "${query}"`
    if (activeTagIds.length > 0) {
      const names = activeTagIds
        .map((id) => (tags.data || []).find((item) => item.id === id)?.name)
        .filter(Boolean)
      if (names.length === 1) return `Tag: ${names[0]}`
      if (names.length > 1) return `Tags: ${names.join(', ')}`
      return 'Filtered documents'
    }
    if (activeFolderId) {
      const name = findFolderName(folderTree.data?.items, activeFolderId)
      return name ? `Folder: ${name}` : 'Documents'
    }
    return 'All documents'
  }, [mode, query, activeTagIds, tags.data, activeFolderId, folderTree.data])

  // ------------------------------------------------- document CRUD dialogs
  const [createOpen, setCreateOpen] = useState(false)
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState('')

  const createFolderName =
    mode === 'documents' && activeFolderId
      ? findFolderName(folderTree.data?.items, activeFolderId)
      : null

  async function handleCreateDocument({ title }) {
    setCreateBusy(true)
    setCreateError('')
    try {
      const created = await documentList.create({
        title,
        folderId: mode === 'documents' ? activeFolderId : null,
      })
      setCreateOpen(false)
      openDocument(created.id)
      toast.success('Document created')
    } catch (caught) {
      const msg = caught.message || 'Something went wrong. Please try again.'
      setCreateError(msg)
      toast.error(msg)
    } finally {
      setCreateBusy(false)
    }
  }

  const [renaming, setRenaming] = useState(null)
  const [moving, setMoving] = useState(null)
  const [trashing, setTrashing] = useState(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState('')

  async function handleRenameDocument(title) {
    if (!renaming) return
    setActionBusy(true)
    setActionError('')
    try {
      await updateDocumentRequest(renaming.id, { title })
      setRenaming(null)
      documentList.reload()
      if (activeDocumentId === renaming.id) {
        document.reload()
      }
      toast.success('Document renamed')
    } catch (caught) {
      const msg = caught.message || 'Something went wrong. Please try again.'
      setActionError(msg)
      toast.error(msg)
    } finally {
      setActionBusy(false)
    }
  }

  async function handleMoveDocument(folderId) {
    if (!moving) return
    setActionBusy(true)
    setActionError('')
    try {
      await updateDocumentRequest(moving.id, { folderId })
      setMoving(null)
      documentList.reload()
      if (activeDocumentId === moving.id) {
        document.reload()
      }
      toast.success('Document moved')
    } catch (caught) {
      const msg = caught.message || 'Something went wrong. Please try again.'
      setActionError(msg)
      toast.error(msg)
    } finally {
      setActionBusy(false)
    }
  }

  async function handleTrashDocument() {
    if (!trashing) return
    setActionBusy(true)
    setActionError('')
    try {
      await documentList.trash(trashing.id)
      setTrashing(null)
      if (activeDocumentId === trashing.id) {
        closeDocument()
      }
      toast.success('Document moved to trash')
    } catch (caught) {
      const msg = caught.message || 'Something went wrong. Please try again.'
      setActionError(msg)
      toast.error(msg)
    } finally {
      setActionBusy(false)
    }
  }

  async function handleRestoreDocument(target) {
    if (!target?.id) {
      throw new Error('No document selected')
    }
    setActionNotice('')
    try {
      await documentList.restore(target.id)
      if (activeDocumentId === target.id) {
        document.reload()
      }
      toast.success('Document restored')
    } catch (caught) {
      reportActionError(caught, 'Could not restore the document.')
      throw caught
    }
  }

  // -------------------------------------------------------- editor actions
  async function handleEditorTrash() {
    if (!document.data) return
    setActionError('')
    setTrashing(document.data)
  }

  async function handleToggleFavorite(docOrItem) {
    setActionNotice('')
    const wasFavorite = Boolean(
      activeDocumentId && docOrItem?.id === activeDocumentId
        ? document.data?.is_favorite
        : docOrItem?.is_favorite,
    )
    try {
      if (activeDocumentId && docOrItem?.id === activeDocumentId) {
        await document.toggleFavorite()
        documentList.reload()
      } else {
        await documentList.toggleFavorite(docOrItem)
      }
      toast.success(wasFavorite ? 'Removed from favorites' : 'Added to favorites')
    } catch (caught) {
      reportActionError(caught, 'Could not update favorite status.')
    }
  }

  // ------------------------------------------------------- sidebar actions
  async function handleCreateWorkspace(payload) {
    const workspace = await workspaces.create(payload)
    setActiveWorkspaceId(workspace.id)
    resetViewFilters()
    toast.success('Vault created')
    return workspace
  }

  async function handleFolderDelete(folderNodeOrId) {
    const node =
      folderNodeOrId && typeof folderNodeOrId === 'object'
        ? folderNodeOrId
        : null
    const folderId =
      folderNodeOrId && typeof folderNodeOrId === 'object'
        ? folderNodeOrId.id
        : folderNodeOrId
    try {
      await folderTree.remove(folderId)
      if (node && containsFolder(node, activeFolderId)) {
        setActiveFolderId(null)
      } else if (activeFolderId === folderId) {
        setActiveFolderId(null)
      }
      documentList.reload()
      toast.success('Folder deleted')
    } catch (caught) {
      toast.error(caught?.message || 'Could not delete the folder.')
      throw caught
    }
  }

  const docMatchesRoute = Boolean(
    activeDocumentId && document.data?.id === activeDocumentId,
  )
  const showProperties =
    activeDocumentId && (docMatchesRoute || document.status === 'error')

  const sidebarProps = {
    workspaces,
    activeWorkspaceId,
    onWorkspaceChange: handleWorkspaceChange,
    onCreateWorkspace: handleCreateWorkspace,
    query,
    onQueryChange: setQuery,
    mode,
    onModeChange: handleModeChange,
    tags,
    activeTagIds,
    onTagFilterChange: handleTagFilterChange,
    folderTree,
    activeFolderId,
    onFolderSelect: handleFolderSelect,
    onFolderCreate: async ({ parentId, name }) => {
      const created = await folderTree.create({ parentId, name })
      toast.success('Folder created')
      return created
    },
    onFolderRename: async (id, name) => {
      const renamed = await folderTree.rename(id, name)
      toast.success('Folder renamed')
      return renamed
    },
    onFolderDelete: handleFolderDelete,
    onCreateDocument: () => {
      setLibraryOpen(false)
      setCreateOpen(true)
    },
  }

  const propertiesContent = showProperties ? (
    document.status === 'error' && !docMatchesRoute ? (
      <div className="p-2 pt-3">
        <ErrorState
          title="Document details could not be loaded"
          message={document.error?.message}
          onRetry={document.reload}
          className="text-[12px]"
        />
      </div>
    ) : document.status === 'ready' && docMatchesRoute ? (
      <PropertiesPanel
        document={document.data}
        tags={tags}
        links={links}
        documents={documentList.documents}
        onAttachTag={async (tagId) => { await document.attachTag(tagId); toast.success('Tag attached') }}
        onDetachTag={async (tagId) => { await document.detachTag(tagId); toast.success('Tag removed') }}
        onCreateTag={async (payload) => { const t = await tags.create(payload); toast.success('Tag created'); return t }}
        onUpdateTag={async (id, patch) => { await handleUpdateTag(id, patch); toast.success('Tag updated') }}
        onDeleteTag={async (id) => { await handleDeleteTag(id); toast.success('Tag deleted') }}
        onCreateLink={async (payload) => { const l = await links.createLink(payload); toast.success('Link created'); return l }}
        onRemoveLink={async (id) => { await links.removeLink(id); toast.success('Link removed') }}
        onOpenDocument={openDocument}
        onRestoreVersion={async (versionNumber) => {
          await document.restoreVersion(versionNumber)
          documentList.reload()
          toast.success('Version restored')
        }}
      />
    ) : (
      <div
        className="grid content-start gap-4 pt-2"
        role="status"
        aria-label="Loading document details"
      >
        {[0, 1, 2].map((index) => (
          <div key={index} className="grid gap-2">
            <div className="h-2.5 w-1/2 animate-pulse rounded-md bg-primary/10" />
            <div className="h-2.5 w-2/3 animate-pulse rounded-md bg-primary/10" />
          </div>
        ))}
      </div>
    )
  ) : (
    <div className="grid content-start gap-4 pt-2">
      <p className="px-2 text-[13px] text-muted-foreground">
        Open a document to see its properties, tags and backlinks.
      </p>
    </div>
  )

  return (
    <div className="-mx-6 -mb-10 -mt-8 flex h-[calc(100dvh-var(--header-height))] overflow-hidden bg-background text-foreground max-lg:-mx-5 max-lg:-mb-8 max-lg:-mt-6 max-sm:-mx-4 max-sm:-mb-8 max-sm:-mt-5">
      {isDesktop && <LeftSidebar {...sidebarProps} />}

      <div className="flex min-w-0 flex-1 flex-col">
        {(!isDesktop || (!isWide && activeDocumentId)) && (
          <div className="flex flex-none items-center justify-between gap-2 border-b border-border bg-background px-3 py-2">
            {!isDesktop ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => setLibraryOpen(true)}
              >
                <Library size={14} aria-hidden="true" />
                Library
              </Button>
            ) : <span />}
            {activeDocumentId && !isWide && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => setDetailsOpen(true)}
              >
                <PanelRight size={14} aria-hidden="true" />
                Details
              </Button>
            )}
          </div>
        )}

        {actionNotice && (
          <div
            role="alert"
            className="flex flex-none items-center justify-between gap-3 border-b border-destructive/20 bg-destructive/5 px-4 py-2 text-[13px] text-destructive"
          >
            <span className="min-w-0 flex-1">{actionNotice}</span>
            <IconButton
              label="Dismiss message"
              className="size-6 text-destructive hover:text-destructive"
              onClick={() => setActionNotice('')}
            >
              <X size={14} aria-hidden="true" />
            </IconButton>
          </div>
        )}

        <div className="flex min-h-0 flex-1 overflow-hidden">
          {activeDocumentId ? (
            document.status === 'error' && !docMatchesRoute ? (
              <main className="flex min-w-0 flex-1 flex-col bg-card p-5">
                <ErrorState
                  title="Document could not be loaded"
                  message={document.error?.message}
                  onRetry={document.reload}
                  retryLabel="Try again"
                />
              </main>
            ) : !docMatchesRoute ? (
              <main
                className="flex min-w-0 flex-1 flex-col bg-card"
                aria-label="Loading document"
                role="status"
              >
                <div className="grid gap-3 p-6" aria-busy="true">
                  <div className="h-7 w-1/3 animate-pulse rounded-md bg-primary/10" />
                  <div className="h-3 w-2/3 animate-pulse rounded-md bg-primary/10" />
                  <div className="h-3 w-full animate-pulse rounded-md bg-primary/10" />
                  <div className="h-3 w-5/6 animate-pulse rounded-md bg-primary/10" />
                </div>
              </main>
            ) : (
              <DocumentEditor
                key={document.data.id}
                document={document.data}
                onSave={document.update}
                onToggleFavorite={() => handleToggleFavorite(document.data)}
                onTrash={handleEditorTrash}
                onRestore={handleRestoreDocument}
                onBack={closeDocument}
                onOpenDocument={openDocument}
                workspaceId={activeWorkspaceId}
                folderNameById={folderNameById}
              />
            )
          ) : mode === 'graph' ? (
            <DocumentGraph
              workspaceId={activeWorkspaceId}
              activeDocumentId={activeDocumentId}
              onOpenDocument={openDocument}
            />
          ) : (
            <DocumentList
              mode={mode}
              heading={listHeading}
              documentList={documentList}
              searchActive={Boolean(query?.trim()) || activeTagIds.length > 0}
              onCreate={() => setCreateOpen(true)}
              onOpen={openDocument}
              onToggleFavorite={handleToggleFavorite}
              onRename={setRenaming}
              onMove={setMoving}
              onTrash={(item) => {
                setActionError('')
                setTrashing(item)
              }}
              onRestore={async (item) => {
                try {
                  await handleRestoreDocument(item)
                } catch {
                  // Error is surfaced via action notice; swallow to avoid unhandled rejection.
                }
              }}
            />
          )}

          {isWide && showProperties && (
            <aside
              className="flex w-[300px] flex-none flex-col overflow-y-auto border-l border-border bg-background px-3"
              aria-label="Document details"
            >
              {propertiesContent}
            </aside>
          )}
        </div>
      </div>

      {!isDesktop && (
        <Sheet open={libraryOpen} onOpenChange={setLibraryOpen}>
          <SheetContent
            side="left"
            className="w-[300px] max-w-[85vw] p-0 sm:max-w-sm"
            aria-label="Document library"
          >
            <LeftSidebar
              {...sidebarProps}
              className="h-full w-full max-w-none border-r-0"
            />
          </SheetContent>
        </Sheet>
      )}

      {!isWide && activeDocumentId && (
        <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
          <SheetContent
            side="right"
            className="w-[340px] max-w-[92vw] overflow-y-auto px-3 py-4 sm:max-w-sm"
            aria-label="Document details"
          >
            {propertiesContent}
          </SheetContent>
        </Sheet>
      )}

      {/* ------------------------------------------------------------ dialogs */}

      <CreateDocumentDialog
        open={createOpen}
        folderName={createFolderName}
        busy={createBusy}
        error={createError}
        onClose={() => {
          if (!createBusy) {
            setCreateOpen(false)
            setCreateError('')
          }
        }}
        onCreate={handleCreateDocument}
      />

      <RenameDocumentDialog
        open={Boolean(renaming)}
        document={renaming}
        busy={actionBusy}
        error={actionError}
        onClose={() => {
          if (!actionBusy) {
            setRenaming(null)
            setActionError('')
          }
        }}
        onRename={handleRenameDocument}
      />

      <MoveDocumentDialog
        open={Boolean(moving)}
        document={moving}
        folders={folderTree.data?.items}
        busy={actionBusy}
        error={actionError}
        onClose={() => {
          if (!actionBusy) {
            setMoving(null)
            setActionError('')
          }
        }}
        onMove={handleMoveDocument}
      />

      <ConfirmDialog
        open={Boolean(trashing)}
        title={`Move "${trashing?.title || ''}" to trash?`}
        description="You can restore it from the trash later."
        confirmLabel="Move to trash"
        busy={actionBusy}
        busyLabel="Moving…"
        error={actionError}
        onConfirm={handleTrashDocument}
        onClose={() => {
          if (!actionBusy) {
            setTrashing(null)
            setActionError('')
          }
        }}
      />
    </div>
  )
}
