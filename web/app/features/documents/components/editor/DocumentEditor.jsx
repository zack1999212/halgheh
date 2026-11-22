import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Check,
  ChevronLeft,
  CircleAlert,
  Eye,
  LoaderCircle,
  Pencil,
  Sparkles,
  Star,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import IconButton from '@/components/shared/IconButton.jsx'
import ErrorState from '@/components/shared/ErrorState.jsx'
import { cn } from '@/lib/utils'
import { listDocuments } from '../../api/client.js'
import { countCharacters, countWords } from '../../utils/textStats.js'
import { renderMarkdown } from '../../utils/markdown.js'
import { formatRelativeTime } from '../../utils/formatTime.js'
import DocumentAIAssistant from '../ai/DocumentAIAssistant.jsx'

const AUTOSAVE_DELAY_MS = 800
const WIKI_SUGGESTION_LIMIT = 8

/**
 * Tailwind-only styles for the rendered Markdown preview. The preview HTML
 * comes from the project's own escaping renderer (`utils/markdown.js`), so
 * arbitrary document content can never inject markup.
 */
const previewClasses =
  'grid gap-3 text-[14px] leading-relaxed [&_h1]:mt-2 [&_h1]:border-b [&_h1]:border-border [&_h1]:pb-2 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mt-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:text-[15px] [&_h3]:font-semibold [&_h4]:text-[14px] [&_h4]:font-semibold [&_h5]:text-[13.5px] [&_h5]:font-semibold [&_h6]:text-[13px] [&_h6]:font-semibold [&_h6]:text-muted-foreground [&_p]:text-[14px] [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:text-[14px] [&_li+li]:mt-1 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:text-[12.5px] [&_code]:rounded [&_code]:bg-muted [&_px]:px-1 [&_code]:text-[12.5px] [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_hr]:border-border [&_a]:underline [&_a]:underline-offset-2'

function SaveStatus({ state }) {
  if (state === 'saving') {
    return (
      <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <LoaderCircle size={13} aria-hidden="true" className="animate-spin" />
        Saving…
      </span>
    )
  }
  if (state === 'saved') {
    return (
      <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <Check size={13} aria-hidden="true" />
        Saved
      </span>
    )
  }
  if (state === 'dirty' || state === 'error') {
    return (
      <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-foreground" />
        {state === 'error' ? 'Not saved' : 'Unsaved changes'}
      </span>
    )
  }
  return null
}

/**
 * Markdown document editor.
 *
 * Editing happens in a plain textarea (no editor library: see the stage
 * notes) with a read-only preview toggle rendered by the project's own
 * escaping Markdown renderer. Changes autosave ~0.8s after the last
 * keystroke through PATCH /documents/{id}; pending changes are flushed when
 * the document is closed or the tab is closed.
 */
export default function DocumentEditor({
  document: doc,
  onSave,
  onToggleFavorite,
  onTrash,
  onRestore,
  onBack,
  onOpenDocument,
  workspaceId,
  folderNameById = {},
  readOnly = false,
}) {
  // Initialise from the already-loaded document. Starting from empty strings
  // would make the first render look "dirty" until the sync effect runs, and
  // React StrictMode's development mount/unmount would then flush that empty
  // draft (empty title => HTTP 422) every time a document is opened.
  const [draft, setDraft] = useState(() => ({
    title: doc?.title ?? '',
    content: doc?.content ?? '',
  }))
  const [saveState, setSaveState] = useState('idle') // idle|dirty|saving|saved|error
  const [saveError, setSaveError] = useState('')
  useEffect(() => {
    if (saveState !== 'saved') return undefined
    const t = window.setTimeout(() => {
      setSaveState((current) => (current === 'saved' ? 'idle' : current))
    }, 1500)
    return () => window.clearTimeout(t)
  }, [saveState])
  const [showPreview, setShowPreview] = useState(readOnly)
  const [restoreBusy, setRestoreBusy] = useState(false)
  const [restoreError, setRestoreError] = useState('')
  const [aiOpen, setAiOpen] = useState(false)
  const textareaRef = useRef(null)
  const [wikiSuggest, setWikiSuggest] = useState({
    open: false,
    query: '',
    start: 0,
    end: 0,
    items: [],
    loading: false,
    error: '',
    activeIndex: 0,
  })

  const timerRef = useRef(null)
  const draftRef = useRef(draft)
  draftRef.current = draft
  const docRef = useRef(doc)
  docRef.current = doc
  // True only when the user has actually edited the draft. The unmount flush
  // reads this instead of "draft differs from server", because the latter is
  // briefly true before the initial sync and must never produce a request.
  const pendingEditRef = useRef(false)
  // Monotonic counter so a successful save does not clear pending edits that
  // arrived while the request was in flight.
  const editSeqRef = useRef(0)
  const inFlightRef = useRef(false)
  const queuedFlushRef = useRef(false)
  const flushSaveRef = useRef(() => {})
  const aliveRef = useRef(true)
  const onSaveRef = useRef(onSave)
  useEffect(() => {
    aliveRef.current = true
    return () => { aliveRef.current = false }
  }, [])
  onSaveRef.current = onSave

  const documentId = doc?.id
  // Declared before any callback that references it (the suggestion handler
  // closes when the document is in the trash).
  const trashed = Boolean(doc?.is_deleted)

  // New document opened: reset the local draft exactly once per id.
  useEffect(() => {
    if (doc) {
      setDraft({ title: doc.title, content: doc.content })
      setSaveState('idle')
      setSaveError('')
      setShowPreview(readOnly)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, readOnly])

  // External changes (rename / move dialogs, restore) reload the detail;
  // while no local edits are pending, follow the server values instead of
  // letting a stale draft autosave over them.
  const saveStateRef = useRef(saveState)
  saveStateRef.current = saveState

  useEffect(() => {
    const current = docRef.current
    if (
      current &&
      saveStateRef.current === 'idle' &&
      (draft.title !== current.title || draft.content !== current.content)
    ) {
      setDraft({ title: current.title, content: current.content })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.title, doc?.content])

  const dirty = Boolean(
    doc &&
      documentId &&
      (draft.title !== doc.title || draft.content !== doc.content),
  )

  const buildPatch = useCallback(() => {
    const current = docRef.current
    const pending = draftRef.current
    const patch = {}
    if (pending.title !== current.title) patch.title = pending.title
    if (pending.content !== current.content) patch.content = pending.content
    return patch
  }, [])

  const flushSave = useCallback(async () => {
    if (inFlightRef.current) {
      queuedFlushRef.current = true
      return
    }
    const patch = buildPatch()
    if (!Object.keys(patch).length) {
      pendingEditRef.current = false
      queuedFlushRef.current = false
      if (aliveRef.current) setSaveState('idle')
      return
    }
    if (!String(draftRef.current.title ?? '').trim()) {
      if (aliveRef.current) setSaveState('dirty')
      return
    }
    const seq = editSeqRef.current
    inFlightRef.current = true
    queuedFlushRef.current = false
    if (aliveRef.current) setSaveState('saving')
    try {
      await onSaveRef.current(patch)
      if (editSeqRef.current === seq) {
        pendingEditRef.current = false
        if (aliveRef.current) {
          setSaveState('saved')
          setSaveError('')
        }
      } else if (aliveRef.current) {
        setSaveState('dirty')
        setSaveError('')
      }
    } catch (caught) {
      if (aliveRef.current) {
        setSaveState('error')
        setSaveError(caught.message || 'Could not save the document.')
      }
    } finally {
      inFlightRef.current = false
      if (
        aliveRef.current &&
        (queuedFlushRef.current || (pendingEditRef.current && editSeqRef.current !== seq))
      ) {
        queuedFlushRef.current = false
        window.setTimeout(() => { void flushSaveRef.current() }, 0)
      }
    }
  }, [buildPatch])
  flushSaveRef.current = flushSave

  // Preview resolution is backend-authoritative (audit finding M3): the
  // server returns `wiki_resolutions` on the document detail, keyed by the
  // exact token text and computed with the same workspace/access/deleted/
  // self/duplicate rules as wiki link synchronization. The loaded (filtered,
  // paginated) document list is never used for resolution, so preview state
  // cannot diverge from what sync stores.
  //
  // Unicode note (L8): the backend matches with Python `casefold()` while
  // this key lookup is exact-string; both sides trim the token first. Rare
  // Unicode normalization differences (e.g. `ß`/`ss`) can make a token show
  // as "unknown" even though the backend would resolve it after save.
  const wikiResolver = useCallback(
    (title) => {
      const key = String(title ?? '').trim()
      if (!key) return { status: 'unknown' }
      const info = doc?.wiki_resolutions?.[key]
      // Missing/stale key (not yet saved, or content changed since the last
      // detail reload): neutral state, never clickable.
      if (!info || typeof info !== 'object') return { status: 'unknown' }
      if (info.status === 'resolved') {
        if (info.document_id == null) return { status: 'unknown' }
        return {
          status: 'resolved',
          id: info.document_id,
          folderName: info.folder_name || null,
        }
      }
      if (info.status === 'ambiguous') return { status: 'ambiguous' }
      if (info.status === 'unresolved') return { status: 'unresolved' }
      return { status: 'unknown' }
    },
    [doc?.wiki_resolutions],
  )

  const closeWikiSuggestions = useCallback(() => {
    setWikiSuggest((current) => ({
      ...current,
      open: false,
      items: [],
      loading: false,
      error: '',
      activeIndex: 0,
    }))
  }, [])

  const updateWikiSuggestionsFromCaret = useCallback(
    (content, caret) => {
      if (readOnly || showPreview || trashed || !workspaceId) {
        closeWikiSuggestions()
        return
      }
      const value = String(content ?? '')
      const before = value.slice(0, caret)
      const open = before.lastIndexOf('[[')
      if (open === -1) {
        closeWikiSuggestions()
        return
      }
      const closeBefore = before.lastIndexOf(']]')
      if (closeBefore > open) {
        closeWikiSuggestions()
        return
      }
      const fragment = before.slice(open + 2)
      if (fragment.includes('\n') || fragment.includes(']')) {
        closeWikiSuggestions()
        return
      }
      const pipeIndex = fragment.indexOf('|')
      const query = (pipeIndex === -1 ? fragment : fragment.slice(0, pipeIndex)).trim()
      if (query.length === 0) {
        // Keep closed until user types to avoid noisy suggestions.
        closeWikiSuggestions()
        return
      }
      const endToken = value.indexOf(']]', caret)
      const end = endToken === -1 ? caret : endToken + 2
      setWikiSuggest((current) => {
        // Only a changed query starts a new request (and therefore shows the
        // loading state). Moving the caret inside an unchanged token keeps
        // the current results and keyboard selection intact, so the panel can
        // never get stuck on "Searching…" without a fetch (audit H1).
        const queryChanged = !current.open || current.query !== query
        return {
          ...current,
          open: true,
          query,
          start: open,
          end,
          loading: queryChanged ? true : current.loading,
          error: queryChanged ? '' : current.error,
          activeIndex: queryChanged ? 0 : current.activeIndex,
        }
      })
    },
    [closeWikiSuggestions, showPreview, trashed, workspaceId],
  )

  useEffect(() => {
    if (!wikiSuggest.open || !workspaceId) return undefined
    let cancelled = false
    const timer = window.setTimeout(async () => {
      try {
        const result = await listDocuments({
          workspaceId,
          query: wikiSuggest.query,
          isDeleted: false,
          limit: WIKI_SUGGESTION_LIMIT,
        })
        if (cancelled) return
        const queryKey = wikiSuggest.query.trim().toLowerCase()
        const items = (result?.items || [])
          .filter((item) => item.id !== doc?.id)
          .map((item) => ({
            id: item.id,
            title: item.title,
            folderId: item.folder_id ?? null,
            folderName:
              item.folder_name ||
              (item.folder_id != null ? folderNameById[item.folder_id] : null) ||
              null,
          }))
          // L6: an exact-title match must never be hidden behind newer
          // substring matches (Array.sort is stable, so the backend order is
          // preserved inside each group).
          .sort((a, b) => {
            const aExact =
              a.title.trim().toLowerCase() === queryKey ? 0 : 1
            const bExact =
              b.title.trim().toLowerCase() === queryKey ? 0 : 1
            return aExact - bExact
          })
        setWikiSuggest((current) =>
          // Only apply the response if this request is still the current,
          // open search for the same query (stale-response guard).
          current.open && current.query === wikiSuggest.query
            ? {
                ...current,
                items,
                loading: false,
                error: '',
                activeIndex: 0,
              }
            : current,
        )
      } catch (caught) {
        if (cancelled) return
        setWikiSuggest((current) =>
          current.open && current.query === wikiSuggest.query
            ? {
                ...current,
                items: [],
                loading: false,
                error: caught?.message || 'Could not load suggestions.',
              }
            : current,
        )
      }
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [wikiSuggest.open, wikiSuggest.query, workspaceId, doc?.id, folderNameById])

  useEffect(() => {
    if (showPreview) closeWikiSuggestions()
  }, [showPreview, closeWikiSuggestions])

  function applyWikiSuggestion(item) {
    if (!item || !textareaRef.current) return
    const value = draftRef.current.content || ''
    const before = value.slice(0, wikiSuggest.start)
    const after = value.slice(wikiSuggest.end)
    const inserted = `[[${item.title}]]`
    const next = `${before}${inserted}${after}`
    updateDraft({ content: next })
    closeWikiSuggestions()
    window.requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      const pos = before.length + inserted.length
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }

  function scheduleSave() {
    if (readOnly) return
    setSaveState('dirty')
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      void flushSaveRef.current()
    }, AUTOSAVE_DELAY_MS)
  }

  function updateDraft(patch) {
    if (readOnly) return
    editSeqRef.current += 1
    pendingEditRef.current = true
    setDraft((current) => ({ ...current, ...patch }))
    scheduleSave()
  }

  // Flush pending changes when another document is opened or the page
  // closes; best-effort, matching the debounce semantics.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
      if (!readOnly && pendingEditRef.current) {
        const patch = buildPatch()
        if (
          Object.keys(patch).length &&
          String(draftRef.current.title ?? '').trim()
        ) {
          onSaveRef.current(patch).catch(() => {})
        }
      }
    }
  }, [documentId, buildPatch, readOnly])

  // Warn before losing unsaved edits by closing the tab.
  useEffect(() => {
    if (readOnly || !dirty) {
      return undefined
    }
    function handleBeforeUnload(event) {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [dirty, readOnly])

  if (!doc) {
    return (
      <section className="flex min-w-0 flex-1 flex-col" aria-label="Document editor">
        <div className="p-5">
          <ErrorState
            title="Document could not be loaded"
            message="It may have been deleted or you may not have access to it."
            onRetry={onBack}
            retryLabel="Back to documents"
          />
        </div>
      </section>
    )
  }

  const canEdit = !readOnly && !trashed

  // Clamp the highlighted index to the options actually rendered, so
  // aria-activedescendant always references a present DOM element even if
  // the item list shrank underneath the selection (audit H1).
  const activeSuggestionIndex = wikiSuggest.items.length
    ? Math.min(Math.max(wikiSuggest.activeIndex, 0), wikiSuggest.items.length - 1)
    : -1
  const activeSuggestion =
    activeSuggestionIndex >= 0 ? wikiSuggest.items[activeSuggestionIndex] : null

  return (
    <section className="flex min-w-0 flex-1 flex-col" aria-label="Document editor">
      {/* Header: back, title, favorite, trash */}
      <header className="flex flex-none items-center gap-2 border-b border-border px-4 py-3">
        <IconButton label="Back to documents" onClick={onBack}>
          <ChevronLeft size={17} aria-hidden="true" />
        </IconButton>

        <Input
          value={draft.title}
          onChange={(event) => updateDraft({ title: event.target.value })}
          maxLength={256}
          aria-label="Document title"
          disabled={!canEdit}
          className="h-9 min-w-0 flex-1 rounded-md border-0 bg-transparent px-2 text-[17px] font-semibold tracking-[-0.01em] shadow-none focus-visible:ring-1 focus-visible:ring-ring md:text-lg"
          placeholder="Untitled document"
        />

        {!readOnly && <SaveStatus state={saveState} />}
        {readOnly && <span className="text-[12px] text-muted-foreground">View only</span>}

        <IconButton
          label="AI assistant"
          onClick={() => setAiOpen(true)}
        >
          <Sparkles size={16} aria-hidden="true" />
        </IconButton>

        {!readOnly && (
          <IconButton
            label={doc.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
            aria-pressed={doc.is_favorite}
            className={doc.is_favorite ? 'text-foreground' : undefined}
            onClick={onToggleFavorite}
          >
            <Star
              size={16}
              aria-hidden="true"
              className={doc.is_favorite ? 'fill-current' : undefined}
            />
          </IconButton>
        )}

        {!readOnly && !trashed && (
          <IconButton
            label="Move to trash"
            className="hover:text-destructive"
            onClick={onTrash}
          >
            <Trash2 size={16} aria-hidden="true" />
          </IconButton>
        )}
      </header>

      {trashed && (
        <div
          role="alert"
          className="flex flex-none flex-wrap items-center justify-between gap-3 border-b border-border bg-muted px-5 py-2.5 text-[13px] text-muted-foreground"
        >
          <span className="flex items-center gap-2">
            <CircleAlert size={14} aria-hidden="true" />
            {readOnly ? 'This document is in the trash.' : 'This document is in the trash. Restore it to continue editing.'}
          </span>
          {!readOnly && (
            <div className="flex flex-col items-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                disabled={restoreBusy}
                onClick={async () => {
                  setRestoreBusy(true)
                  setRestoreError('')
                  try {
                    await onRestore(doc)
                  } catch (caught) {
                    setRestoreError(
                      caught?.message || 'Could not restore the document.',
                    )
                  } finally {
                    setRestoreBusy(false)
                  }
                }}
              >
                {restoreBusy ? 'Restoring…' : 'Restore'}
              </Button>
              {restoreError && (
                <p className="text-[12px] text-destructive">{restoreError}</p>
              )}
            </div>
          )}
        </div>
      )}

      {!readOnly && saveState === 'error' && (
        <div className="flex-none px-5 pt-3">
          <ErrorState
            title="Your changes could not be saved"
            message={saveError}
            onRetry={() => { void flushSaveRef.current() }}
          />
        </div>
      )}

      {/* Toolbar: edit/preview toggle + stats */}
      <div className="flex flex-none items-center justify-between gap-3 px-5 py-2">
        {!readOnly ? (
          <div
            className="flex items-center gap-0.5 rounded-md bg-muted p-0.5"
            role="group"
            aria-label="Editor mode"
          >
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={cn(
                'h-7 gap-1.5 px-2.5 text-[12.5px]',
                !showPreview && 'bg-card text-foreground shadow-sm hover:bg-card',
              )}
              aria-pressed={!showPreview}
              onClick={() => setShowPreview(false)}
            >
              <Pencil size={13} aria-hidden="true" />
              Write
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-pressed={showPreview}
              className={cn(
                'h-7 gap-1.5 px-2.5 text-[12.5px]',
                showPreview && 'bg-card text-foreground shadow-sm hover:bg-card',
              )}
              onClick={() => setShowPreview(true)}
            >
              <Eye size={13} aria-hidden="true" />
              Preview
            </Button>
          </div>
        ) : (
          <p className="text-[12.5px] font-medium text-muted-foreground">Preview</p>
        )}

        <p className="text-[12px] text-muted-foreground">
          {countWords(draft.content)} words · {countCharacters(draft.content)}{' '}
          characters
        </p>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        {(showPreview || readOnly) ? (
          <div className="grid gap-3">
            <div
              className={cn('max-w-[760px]', previewClasses)}
              onClick={(event) => {
                const anchor = event.target.closest('a[data-wiki-doc-id]')
                if (!anchor) return
                event.preventDefault()
                const id = Number(anchor.getAttribute('data-wiki-doc-id'))
                if (id && onOpenDocument) onOpenDocument(id)
              }}
              // Safe: renderMarkdown HTML-escapes all document content first.
              dangerouslySetInnerHTML={{
                __html: renderMarkdown(trashed ? doc.content : draft.content, {
                  wiki: { resolve: wikiResolver },
                }),
              }}
            />
            <p className="text-[12px] text-muted-foreground">
              Wiki links: <code className="rounded bg-muted px-1">[[Title]]</code>. Statuses are computed by the server for the saved content with the same rules as link synchronization: exactly one accessible match links, several matches are ambiguous (never linked automatically), none is unresolved, and a token typed since the last save shows as unknown until it is saved.
            </p>
          </div>
        ) : (
          <div className="relative">
            <Textarea
              ref={textareaRef}
              value={draft.content}
              onChange={(event) => {
                const value = event.target.value
                updateDraft({ content: value })
                const caret = event.target.selectionStart ?? value.length
                updateWikiSuggestionsFromCaret(value, caret)
              }}
              onSelect={(event) => {
                const caret = event.target.selectionStart ?? draft.content.length
                updateWikiSuggestionsFromCaret(draftRef.current.content || '', caret)
              }}
              onKeyUp={(event) => {
                const caret = event.target.selectionStart ?? (draftRef.current.content || '').length
                updateWikiSuggestionsFromCaret(draftRef.current.content || '', caret)
              }}
              onKeyDown={(event) => {
                if (!wikiSuggest.open) return
                if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  setWikiSuggest((current) => ({
                    ...current,
                    activeIndex:
                      current.items.length === 0
                        ? 0
                        : (current.activeIndex + 1) % current.items.length,
                  }))
                  return
                }
                if (event.key === 'ArrowUp') {
                  event.preventDefault()
                  setWikiSuggest((current) => ({
                    ...current,
                    activeIndex:
                      current.items.length === 0
                        ? 0
                        : (current.activeIndex - 1 + current.items.length) %
                          current.items.length,
                  }))
                  return
                }
                if (event.key === 'Enter' || event.key === 'Tab') {
                  if (activeSuggestion) {
                    event.preventDefault()
                    applyWikiSuggestion(activeSuggestion)
                  }
                  return
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  closeWikiSuggestions()
                }
              }}
              onBlur={() => {
                if (timerRef.current) {
                  window.clearTimeout(timerRef.current)
                  timerRef.current = null
                  void flushSaveRef.current()
                }
                // Delay closing so click/keyboard selection can complete.
                window.setTimeout(() => closeWikiSuggestions(), 120)
              }}
              disabled={!canEdit}
              aria-label="Document content (Markdown)"
              aria-autocomplete="list"
              aria-expanded={wikiSuggest.open}
              aria-controls="wiki-link-suggestions"
              aria-activedescendant={
                wikiSuggest.open && activeSuggestion
                  ? `wiki-suggestion-${activeSuggestion.id}`
                  : undefined
              }
              placeholder="Start writing in Markdown… Use [[Title]] to link documents."
              className="h-full min-h-[320px] resize-none border-0 bg-transparent px-0 font-mono text-[13.5px] leading-relaxed shadow-none focus-visible:ring-0"
              spellCheck
            />

            {!readOnly && wikiSuggest.open && (
              <div
                id="wiki-link-suggestions"
                role="listbox"
                aria-label="Wiki link suggestions"
                className="absolute left-0 right-0 top-2 z-20 mx-auto max-w-[760px] rounded-md border border-border bg-popover p-1 shadow-md"
              >
                {wikiSuggest.loading ? (
                  <div className="px-2 py-2 text-[12.5px] text-muted-foreground" role="status">
                    Searching documents…
                  </div>
                ) : wikiSuggest.error ? (
                  <div className="px-2 py-2 text-[12.5px] text-destructive" role="alert">
                    {wikiSuggest.error}
                  </div>
                ) : wikiSuggest.items.length ? (
                  <ul className="max-h-64 overflow-y-auto">
                    {wikiSuggest.items.map((item, index) => {
                      const active = index === activeSuggestionIndex
                      return (
                        <li
                          key={item.id}
                          id={`wiki-suggestion-${item.id}`}
                          role="option"
                          aria-selected={active}
                        >
                          <button
                            type="button"
                            className={cn(
                              'flex w-full items-start justify-between gap-3 rounded-sm px-2 py-1.5 text-left text-[13px] hover:bg-accent',
                              active && 'bg-accent',
                            )}
                            onMouseDown={(event) => {
                              event.preventDefault()
                              applyWikiSuggestion(item)
                            }}
                            onMouseEnter={() =>
                              setWikiSuggest((current) => ({
                                ...current,
                                activeIndex: index,
                              }))
                            }
                          >
                            <span className="min-w-0 flex-1 truncate font-medium">
                              {item.title}
                            </span>
                            {/* L5: only claim "Vault root" when the server
                                says the document really has no folder; a
                                collaborator without folder-tree access simply
                                sees no context instead of a wrong one. */}
                            {item.folderName ? (
                              <span
                                className="max-w-[45%] shrink-0 truncate text-[12px] text-muted-foreground"
                                title={item.folderName}
                              >
                                {item.folderName}
                              </span>
                            ) : item.folderId == null ? (
                              <span className="shrink-0 text-[12px] text-muted-foreground">
                                Vault root
                              </span>
                            ) : null}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <div className="px-2 py-2 text-[12.5px] text-muted-foreground">
                    No matching documents. The saved link stays unresolved (or ambiguous when several accessible documents share the title) unless an accessible document with this exact title exists.
                  </div>
                )}
                <div className="border-t border-border px-2 py-1.5 text-[11px] text-muted-foreground">
                  Use ↑/↓ to navigate, Enter to insert, Esc to close. If multiple documents share a title, the wiki link is treated as ambiguous and not connected automatically.
                </div>
              </div>
            )}
          </div>
        )}

        <p className="mt-3 text-[12px] text-muted-foreground">
          Last updated {formatRelativeTime(doc.updated_at)}
        </p>
      </div>

      <DocumentAIAssistant
        open={aiOpen}
        onOpenChange={setAiOpen}
        document={doc}
        canApply={canEdit}
        getEditSeq={() => editSeqRef.current}
        onApplyContent={(content, meta) => {
          if (!canEdit) return false
          const nextContent = typeof content === 'string' ? content : ''
          const selected = typeof meta?.selectedText === 'string' ? meta.selectedText : ''
          if (meta?.action === 'improve' && selected) {
            const current = draftRef.current.content || ''
            const occurrences = current.split(selected).length - 1
            if (occurrences > 1) {
              return 'Selected text appears multiple times in the document. Provide a more specific selection to avoid replacing the wrong occurrence.'
            }
            if (occurrences === 1) {
              updateDraft({ content: current.replace(selected, nextContent) })
              return true
            }
            return false
          }
          updateDraft({ content: nextContent })
          return true
        }}
      />
    </section>
  )
}
