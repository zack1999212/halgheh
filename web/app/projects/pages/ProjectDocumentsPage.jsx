import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { FileText, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import FormError from '@/components/shared/FormError'
import DocumentList from '../../features/documents/components/documents/DocumentList.jsx'
import CreateDocumentDialog from '../../features/documents/components/documents/CreateDocumentDialog.jsx'
import RenameDocumentDialog from '../../features/documents/components/documents/RenameDocumentDialog.jsx'
import DocumentEditor from '../../features/documents/components/editor/DocumentEditor.jsx'
import { useDocumentList } from '../../features/documents/hooks/useDocumentList.js'
import { useDocument } from '../../features/documents/hooks/useDocument.js'
import { useWorkspaces } from '../../features/documents/hooks/useWorkspaces.js'
import { updateDocument as updateDocumentRequest } from '../../features/documents/api/client.js'

function canManageContent(role) {
  return role === 'owner' || role === 'admin' || role === 'editor'
}

export default function ProjectDocumentsPage() {
  const { projectId } = useParams()
  const outlet = useOutletContext() || {}
  const role = outlet.role || outlet.project?.current_user_role
  const canManage = canManageContent(role)
  const readOnly = !canManage

  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [mode, setMode] = useState('documents') // documents | trash
  const [selectedId, setSelectedId] = useState(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createWorkspaceId, setCreateWorkspaceId] = useState('')

  const [renameState, setRenameState] = useState({ open: false, document: null, busy: false, error: '' })
  const [trashState, setTrashState] = useState({ open: false, document: null, busy: false, error: '' })
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 250)
    return () => clearTimeout(t)
  }, [query])

  // Reset selection when switching modes/project to avoid cross-context leakage.
  useEffect(() => {
    setSelectedId(null)
  }, [projectId, mode])

  const documentList = useDocumentList({
    projectId,
    query: debouncedQuery,
    mode,
  })

  const selectedDocument = useDocument(selectedId)

  const workspaces = useWorkspaces()

  useEffect(() => {
    if (!createOpen) return
    if (createWorkspaceId) return
    const items = Array.isArray(workspaces.data?.items) ? workspaces.data.items : (Array.isArray(workspaces.data) ? workspaces.data : [])
    if (items.length === 1) setCreateWorkspaceId(String(items[0].id))
  }, [createOpen, workspaces.data, createWorkspaceId])

  const workspaceItems = useMemo(() => {
    const data = workspaces.data
    if (Array.isArray(data?.items)) return data.items
    if (Array.isArray(data)) return data
    return []
  }, [workspaces.data])

  const openCreate = useCallback(() => {
    if (readOnly) return
    setCreateError('')
    if (workspaceItems.length === 1) setCreateWorkspaceId(String(workspaceItems[0].id))
    setCreateOpen(true)
  }, [readOnly, workspaceItems])

  const handleCreate = useCallback(async ({ title, workspaceId: wsId }) => {
    if (readOnly) return
    setCreateBusy(true)
    setCreateError('')
    try {
      const created = await documentList.create({ title, workspaceId: wsId || Number(createWorkspaceId) || workspaceItems[0]?.id })
      setCreateOpen(false)
      if (created?.id) setSelectedId(created.id)
    } catch (err) {
      if (err?.status === 401) { outlet.onUnauthorized?.(); return }
      setCreateError(err?.message || 'Could not create the document.')
    } finally {
      setCreateBusy(false)
    }
  }, [readOnly, documentList, createWorkspaceId, workspaceItems, outlet])

  const handleRename = useCallback(async (title) => {
    const doc = renameState.document
    if (!doc || renameState.busy) return
    setRenameState((s) => ({ ...s, busy: true, error: '' }))
    try {
      await updateDocumentRequest(doc.id, { title })
      setRenameState({ open: false, document: null, busy: false, error: '' })
      documentList.reload()
      if (selectedId === doc.id) selectedDocument.reload()
    } catch (err) {
      if (err?.status === 401) { outlet.onUnauthorized?.(); return }
      setRenameState((s) => ({ ...s, busy: false, error: err?.message || 'Could not rename the document.' }))
    }
  }, [renameState, documentList, selectedId, selectedDocument, outlet])

  const handleTrash = useCallback(async () => {
    const doc = trashState.document
    if (!doc || trashState.busy) return
    setTrashState((s) => ({ ...s, busy: true, error: '' }))
    try {
      await documentList.trash(doc.id)
      setTrashState({ open: false, document: null, busy: false, error: '' })
      if (selectedId === doc.id) setSelectedId(null)
    } catch (err) {
      if (err?.status === 401) { outlet.onUnauthorized?.(); return }
      setTrashState((s) => ({ ...s, busy: false, error: err?.message || 'Could not move the document to trash.' }))
    }
  }, [trashState, documentList, selectedId, outlet])

  const handleRestore = useCallback(async (doc) => {
    if (readOnly) return
    setActionError('')
    try {
      await documentList.restore(doc.id)
      if (selectedId === doc.id) selectedDocument.reload()
    } catch (err) {
      if (err?.status === 401) { outlet.onUnauthorized?.(); return }
      setActionError(err?.message || 'Could not restore the document.')
    }
  }, [readOnly, documentList, selectedId, selectedDocument, outlet])

  const handleToggleFavorite = useCallback(async (doc) => {
    if (readOnly) return
    setActionError('')
    try {
      await documentList.toggleFavorite(doc)
      if (selectedId === doc.id) selectedDocument.reload()
    } catch (err) {
      if (err?.status === 401) { outlet.onUnauthorized?.(); return }
      setActionError(err?.message || 'Could not update favorite.')
    }
  }, [readOnly, documentList, selectedId, selectedDocument, outlet])

  const handleEditorSave = useCallback(async (patch) => {
    if (readOnly) throw new Error('View-only access.')
    const updated = await selectedDocument.update(patch)
    documentList.reload()
    return updated
  }, [readOnly, selectedDocument, documentList])

  const handleEditorTrash = useCallback(async () => {
    if (readOnly || !selectedId) return
    try {
      await selectedDocument.trash()
      documentList.reload()
      setSelectedId(null)
    } catch (err) {
      if (err?.status === 401) { outlet.onUnauthorized?.(); return }
      setActionError(err?.message || 'Could not move the document to trash.')
    }
  }, [readOnly, selectedId, selectedDocument, documentList, outlet])

  const handleEditorRestore = useCallback(async () => {
    if (readOnly || !selectedId) return
    try {
      await selectedDocument.restore()
      documentList.reload()
    } catch (err) {
      if (err?.status === 401) { outlet.onUnauthorized?.(); return }
      throw err
    }
  }, [readOnly, selectedId, selectedDocument, documentList, outlet])

  const heading = mode === 'trash' ? 'Project trash' : debouncedQuery ? `Search results` : 'Project documents'

  return (
    <div className="grid gap-4">
      <Card className="project-overview-surface border-[#E5E1D9] shadow-none">
        <CardHeader className="gap-4 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-[20px] font-semibold tracking-[-0.02em] text-foreground">Documents</CardTitle>
                {readOnly && <span className="inline-flex rounded-full border border-border bg-card px-2 py-0.5 text-[11.5px] font-medium text-muted-foreground">View only</span>}
              </div>
              <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
                Project-scoped documents. Open a document to view or edit its Markdown content using the existing editor.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-md bg-muted p-0.5">
                <Button type="button" size="sm" variant={mode === 'documents' ? 'secondary' : 'ghost'} className="h-8 px-2.5" onClick={() => setMode('documents')}>Active</Button>
                <Button type="button" size="sm" variant={mode === 'trash' ? 'secondary' : 'ghost'} className="h-8 px-2.5" onClick={() => setMode('trash')}>Trash</Button>
              </div>
            </div>
          </div>
          <FormError>{actionError}</FormError>
          {mode === 'documents' && (
            <div className="relative max-w-md">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search project documents by title"
                className="h-9 pl-9"
                aria-label="Search project documents"
              />
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0 sm:p-0">
          <div className="grid min-h-[420px] border-t border-[#E5E1D9] lg:grid-cols-[minmax(320px,420px)_1fr]">
            <div className="min-w-0 border-b border-[#E5E1D9] lg:border-b-0 lg:border-r">
              <DocumentList
                mode={mode}
                heading={heading}
                documentList={documentList}
                onCreate={openCreate}
                onOpen={(id) => setSelectedId(id)}
                onToggleFavorite={handleToggleFavorite}
                onRename={canManage ? (doc) => setRenameState({ open: true, document: doc, busy: false, error: '' }) : undefined}
                onTrash={canManage ? (doc) => setTrashState({ open: true, document: doc, busy: false, error: '' }) : undefined}
                onRestore={canManage ? handleRestore : undefined}
                readOnly={readOnly}
              />
            </div>
            <div className="min-w-0">
              {selectedId ? (
                selectedDocument.status === 'loading' ? (
                  <div className="flex h-full min-h-[320px] items-center justify-center p-6 text-[13.5px] text-muted-foreground">Loading document…</div>
                ) : selectedDocument.status === 'error' ? (
                  <div className="p-6">
                    <p className="text-[14px] font-medium text-destructive">Could not load document</p>
                    <p className="mt-1 text-[13px] text-muted-foreground">{selectedDocument.error?.message || 'Please try again.'}</p>
                    <Button type="button" variant="outline" size="sm" className="mt-3" onClick={selectedDocument.reload}>Retry</Button>
                  </div>
                ) : selectedDocument.data ? (
                  <DocumentEditor
                    document={selectedDocument.data}
                    onSave={handleEditorSave}
                    onToggleFavorite={canManage ? async () => { await selectedDocument.toggleFavorite(); documentList.reload() } : undefined}
                    onTrash={canManage ? handleEditorTrash : undefined}
                    onRestore={canManage ? handleEditorRestore : undefined}
                    onBack={() => setSelectedId(null)}
                    readOnly={readOnly}
                  />
                ) : (
                  <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 p-6 text-center">
                    <FileText size={28} className="text-muted-foreground/50" aria-hidden="true" />
                    <p className="text-[14px] font-medium">Document not available</p>
                    <p className="text-[13px] text-muted-foreground">It may have been removed or you may not have access.</p>
                  </div>
                )
              ) : (
                <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 p-6 text-center">
                  <FileText size={28} className="text-muted-foreground/50" aria-hidden="true" />
                  <p className="text-[14px] font-medium">Select a document</p>
                  <p className="max-w-sm text-[13px] text-muted-foreground">Choose a project document from the list to open it{readOnly ? '.' : ', or create a new one.'}</p>
                  {!readOnly && mode === 'documents' && (
                    <Button type="button" size="sm" className="mt-2" onClick={openCreate}>New document</Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <CreateDocumentDialog
        open={createOpen}
        busy={createBusy}
        error={createError}
        onClose={() => { if (!createBusy) { setCreateOpen(false); setCreateError('') } }}
        onCreate={handleCreate}
        workspaces={workspaceItems}
        workspaceId={createWorkspaceId}
        onWorkspaceChange={setCreateWorkspaceId}
      />

      <RenameDocumentDialog
        open={renameState.open}
        document={renameState.document}
        busy={renameState.busy}
        error={renameState.error}
        onClose={() => { if (!renameState.busy) setRenameState({ open: false, document: null, busy: false, error: '' }) }}
        onRename={handleRename}
      />

      <ConfirmDialog
        open={trashState.open}
        title="Move document to trash"
        description={trashState.document ? `Move "${trashState.document.title}" to trash? You can restore it later from Trash.` : 'Move this document to trash?'}
        confirmLabel="Move to trash"
        busyLabel="Moving…"
        busy={trashState.busy}
        error={trashState.error}
        destructive
        onConfirm={handleTrash}
        onClose={() => { if (!trashState.busy) setTrashState({ open: false, document: null, busy: false, error: '' }) }}
      />
    </div>
  )
}
