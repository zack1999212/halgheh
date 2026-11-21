import { useCallback, useEffect, useState } from 'react'
import { Eye, History, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import ConfirmDialog from '@/components/shared/ConfirmDialog.jsx'
import DialogShell from '@/components/shared/DialogShell.jsx'
import EmptyState from '@/components/shared/EmptyState.jsx'
import ErrorState from '@/components/shared/ErrorState.jsx'
import FormError from '@/components/shared/FormError.jsx'
import { getDocumentVersion, listDocumentVersions } from '../../api/client.js'
import { renderMarkdown } from '../../utils/markdown.js'
import { formatFullTime, formatRelativeTime } from '../../utils/formatTime.js'

const previewClasses =
  'grid gap-3 text-[14px] leading-relaxed [&_h1]:mt-2 [&_h1]:border-b [&_h1]:border-border [&_h1]:pb-2 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mt-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:text-[15px] [&_h3]:font-semibold [&_p]:text-[14px] [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:text-[14px] [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:text-[12.5px] [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:text-[12.5px] [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_a]:underline [&_a]:underline-offset-2'

export default function VersionHistorySection({ document, onRestoreVersion }) {
  const [versions, setVersions] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [viewStatus, setViewStatus] = useState('idle')
  const [viewError, setViewError] = useState('')
  const [restoring, setRestoring] = useState(null)
  const [restoreBusy, setRestoreBusy] = useState(false)
  const [restoreError, setRestoreError] = useState('')

  const load = useCallback(async () => {
    if (!document?.id) return
    setStatus('loading')
    setError(null)
    try {
      const data = await listDocumentVersions(document.id, { limit: 50, offset: 0 })
      setVersions(data.items || [])
      setStatus('ready')
    } catch (caught) {
      setError(caught)
      setStatus('error')
    }
  }, [document?.id, document?.updated_at])

  useEffect(() => {
    load()
  }, [load])

  async function handleView(version) {
    setViewing({ ...version, content: version.content ?? '' })
    setViewError('')
    // If content already present, show immediately; otherwise fetch.
    if (version.content !== undefined) return
    setViewStatus('loading')
    try {
      const full = await getDocumentVersion(document.id, version.version_number)
      setViewing(full)
      setViewStatus('ready')
    } catch (caught) {
      setViewError(caught?.message || 'Could not load this version.')
      setViewStatus('error')
    }
  }

  async function handleRestore() {
    if (!restoring || !onRestoreVersion) return
    setRestoreBusy(true)
    setRestoreError('')
    try {
      await onRestoreVersion(restoring.version_number)
      setRestoring(null)
      await load()
    } catch (caught) {
      setRestoreError(caught?.message || 'Could not restore this version.')
    } finally {
      setRestoreBusy(false)
    }
  }

  const latestVersionNumber = versions.length
    ? Math.max(...versions.map((version) => version.version_number))
    : null

  return (
    <div className="grid gap-2">
      {status === 'loading' ? (
        <p className="text-[12.5px] text-muted-foreground" role="status">
          Loading version history…
        </p>
      ) : status === 'error' ? (
        <ErrorState
          title="Version history could not be loaded"
          message={error?.message}
          onRetry={load}
          className="py-1 text-[12px]"
        />
      ) : versions.length === 0 ? (
        <EmptyState
          className="py-2"
          icon={History}
          title="No versions yet"
          description="Version snapshots appear after document changes are saved."
        />
      ) : (
        <ul className="grid gap-1.5" aria-label="Version history">
          {versions.map((version) => {
            const isCurrent = version.version_number === latestVersionNumber
            return (
              <li
                key={version.id}
                className="flex items-start gap-2 rounded-md border border-border px-2.5 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[12.5px] font-medium">
                      Version {version.version_number}
                    </p>
                    {isCurrent && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        Current
                      </span>
                    )}
                  </div>
                  <p
                    className="text-[11px] text-muted-foreground"
                    title={formatFullTime(version.created_at)}
                  >
                    {formatRelativeTime(version.created_at)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={`View version ${version.version_number}`}
                    onClick={() => handleView(version)}
                  >
                    <Eye size={14} aria-hidden="true" />
                  </Button>
                  {!isCurrent && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label={`Restore version ${version.version_number}`}
                      onClick={() => {
                        setRestoreError('')
                        setRestoring(version)
                      }}
                    >
                      <RotateCcw size={14} aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <DialogShell
        open={Boolean(viewing)}
        title={viewing ? `Version ${viewing.version_number}` : 'Version'}
        description={viewing ? formatFullTime(viewing.created_at) : ''}
        onClose={() => {
          setViewing(null)
          setViewError('')
          setViewStatus('idle')
        }}
        footer={
          <>
            {viewing && viewing.version_number !== latestVersionNumber && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setRestoreError('')
                  setRestoring(viewing)
                }}
              >
                <RotateCcw size={14} aria-hidden="true" />
                Restore this version
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={() => setViewing(null)}>
              Close
            </Button>
          </>
        }
      >
        {viewStatus === 'loading' ? (
          <p className="text-[13px] text-muted-foreground">Loading version…</p>
        ) : viewStatus === 'error' ? (
          <ErrorState
            title="Version could not be loaded"
            message={viewError}
            onRetry={() => viewing && handleView(viewing)}
          />
        ) : viewing ? (
          <div className="grid gap-4">
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                Title
              </p>
              <p className="text-[14px] font-medium">{viewing.title}</p>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                Content
              </p>
              <div
                className={previewClasses}
                dangerouslySetInnerHTML={{
                  __html: renderMarkdown(viewing.content || ''),
                }}
              />
            </div>
          </div>
        ) : null}
      </DialogShell>

      <ConfirmDialog
        open={Boolean(restoring)}
        title="Restore this version?"
        description={
          restoring
            ? `Version ${restoring.version_number} will become the current document content. The current content will be preserved in version history.`
            : ''
        }
        confirmLabel="Restore version"
        busy={restoreBusy}
        busyLabel="Restoring…"
        error={restoreError}
        onConfirm={handleRestore}
        onClose={() => {
          if (restoreBusy) return
          setRestoreError('')
          setRestoring(null)
        }}
      />
    </div>
  )
}
