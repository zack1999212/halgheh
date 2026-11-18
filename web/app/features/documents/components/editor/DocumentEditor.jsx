import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Check,
  ChevronLeft,
  CircleAlert,
  Eye,
  LoaderCircle,
  Pencil,
  Star,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import IconButton from '@/components/shared/IconButton.jsx'
import ErrorState from '@/components/shared/ErrorState.jsx'
import { cn } from '@/lib/utils'
import { countCharacters, countWords } from '../../utils/textStats.js'
import { renderMarkdown } from '../../utils/markdown.js'
import { formatRelativeTime } from '../../utils/formatTime.js'

const AUTOSAVE_DELAY_MS = 800

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
}) {
  const [draft, setDraft] = useState({ title: '', content: '' })
  const [saveState, setSaveState] = useState('idle') // idle|dirty|saving|saved|error
  const [saveError, setSaveError] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [restoreBusy, setRestoreBusy] = useState(false)
  const [restoreError, setRestoreError] = useState('')

  const timerRef = useRef(null)
  const draftRef = useRef(draft)
  draftRef.current = draft
  const docRef = useRef(doc)
  docRef.current = doc
  const dirtyRef = useRef(false)
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

  const documentId = doc?.id

  // New document opened: reset the local draft exactly once per id.
  useEffect(() => {
    if (doc) {
      setDraft({ title: doc.title, content: doc.content })
      setSaveState('idle')
      setSaveError('')
      setShowPreview(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId])

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
  dirtyRef.current = dirty

  const buildPatch = useCallback(() => {
    const current = docRef.current
    const pending = draftRef.current
    const patch = {}
    if (pending.title !== current.title) patch.title = pending.title
    if (pending.content !== current.content) patch.content = pending.content
    return patch
  }, [])

  const flushSave = useCallback(async () => {
    const patch = buildPatch()
    if (!Object.keys(patch).length) {
      // The server already matches the draft (e.g. it changed underneath
      // us); nothing to persist, so clear the pending-changes state.
      setSaveState('idle')
      return
    }
    setSaveState('saving')
    try {
      await onSaveRef.current(patch)
      setSaveState('saved')
      setSaveError('')
    } catch (caught) {
      setSaveState('error')
      setSaveError(caught.message || 'Could not save the document.')
    }
  }, [buildPatch])

  function scheduleSave() {
    setSaveState('dirty')
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      flushSave()
    }, AUTOSAVE_DELAY_MS)
  }

  function updateDraft(patch) {
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
      if (dirtyRef.current) {
        const patch = buildPatch()
        if (Object.keys(patch).length) {
          onSaveRef.current(patch).catch(() => {})
        }
      }
    }
  }, [documentId, buildPatch])

  // Warn before losing unsaved edits by closing the tab.
  useEffect(() => {
    if (!dirty) {
      return undefined
    }
    function handleBeforeUnload(event) {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [dirty])

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

  const trashed = Boolean(doc.is_deleted)

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
          disabled={trashed}
          className="h-9 min-w-0 flex-1 rounded-md border-0 bg-transparent px-2 text-[17px] font-semibold tracking-[-0.01em] shadow-none focus-visible:ring-1 focus-visible:ring-ring md:text-lg"
          placeholder="Untitled document"
        />

        <SaveStatus state={saveState} />

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

        {!trashed && (
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
            This document is in the trash. Restore it to continue editing.
          </span>
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
        </div>
      )}

      {saveState === 'error' && (
        <div className="flex-none px-5 pt-3">
          <ErrorState
            title="Your changes could not be saved"
            message={saveError}
            onRetry={() => flushSave()}
          />
        </div>
      )}

      {/* Toolbar: edit/preview toggle + stats */}
      <div className="flex flex-none items-center justify-between gap-3 px-5 py-2">
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

        <p className="text-[12px] text-muted-foreground">
          {countWords(draft.content)} words · {countCharacters(draft.content)}{' '}
          characters
        </p>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        {showPreview ? (
          <div
            className={cn('max-w-[760px]', previewClasses)}
            // Safe: renderMarkdown HTML-escapes all document content first.
            dangerouslySetInnerHTML={{
              __html: renderMarkdown(trashed ? doc.content : draft.content),
            }}
          />
        ) : (
          <Textarea
            value={draft.content}
            onChange={(event) => updateDraft({ content: event.target.value })}
            onBlur={() => {
              if (timerRef.current) {
                window.clearTimeout(timerRef.current)
                timerRef.current = null
                flushSave()
              }
            }}
            disabled={trashed}
            aria-label="Document content (Markdown)"
            placeholder="Start writing in Markdown…"
            className="h-full min-h-[320px] resize-none border-0 bg-transparent px-0 font-mono text-[13.5px] leading-relaxed shadow-none focus-visible:ring-0"
            spellCheck
          />
        )}

        <p className="mt-3 text-[12px] text-muted-foreground">
          Last updated {formatRelativeTime(doc.updated_at)}
        </p>
      </div>
    </section>
  )
}
