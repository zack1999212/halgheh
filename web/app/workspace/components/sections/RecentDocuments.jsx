import { useNavigate } from 'react-router-dom'
import { File, FileCode, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'

function formatModified(value) {
  if (!value) return 'Unknown date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown date'
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function inferFileType(doc) {
  const name = String(doc?.title || doc?.slug || '').toLowerCase()
  const m = name.match(/\.([a-z0-9]+)$/)
  if (!m) return ''
  const ext = m[1]
  if (ext === 'md' || ext === 'markdown') return 'Markdown'
  if (ext === 'txt') return 'Text'
  if (ext === 'pdf') return 'PDF'
  if (['doc', 'docx'].includes(ext)) return 'Word'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'Sheet'
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return 'Image'
  return ext.toUpperCase()
}

function iconForDoc(doc) {
  const type = inferFileType(doc).toLowerCase()
  if (['markdown', 'text'].includes(type)) return FileText
  if (['pdf'].includes(type)) return File
  if (type) return FileCode
  return FileText
}

function DocRow({ doc, onOpen, showSeparator }) {
  const canOpen = doc?.id != null
  const TypeIcon = iconForDoc(doc)
  const fileType = inferFileType(doc)
  const meta = fileType
    ? `${fileType} · Last modified ${formatModified(doc.updatedAt)}`
    : `Last modified ${formatModified(doc.updatedAt)}`

  return (
    <>
      <button
        type="button"
        className="ws-row flex w-full items-center gap-3 px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-default disabled:opacity-100"
        onClick={() => canOpen && onOpen?.(doc)}
        disabled={!canOpen}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-border/80 bg-muted/30 text-muted-foreground">
          <TypeIcon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-5 text-foreground">{doc.title || 'Untitled document'}</p>
          <p className="truncate text-xs text-muted-foreground">{meta}</p>
        </div>
      </button>
      {showSeparator && <Separator className="mx-2" />}
    </>
  )
}

function LoadingList() {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i}>
          <div className="flex items-center gap-3 px-2 py-2">
            <Skeleton className="size-8 rounded-[var(--radius-sm)]" />
            <div className="grid flex-1 gap-1">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
          {i < 3 && <Separator className="mx-2" />}
        </div>
      ))}
    </div>
  )
}

export default function RecentDocuments({ loading, error, documents = [], onRetry }) {
  const navigate = useNavigate()

  const handleOpen = (doc) => {
    if (doc?.id != null) {
      navigate(`/documents/${doc.id}`)
    }
  }

  return (
    <Card className="ws-card min-w-0">
      <CardHeader className="ws-card-head flex flex-row items-center justify-between gap-3 space-y-0 px-4 pb-2 pt-4 sm:px-5 sm:pt-5">
        <CardTitle className="ws-card-title">Recent Documents</CardTitle>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ws-link h-8 rounded-[10px] px-3"
          onClick={() => navigate('/documents')}
        >
          View All
        </Button>
      </CardHeader>
      <CardContent className="px-3 pb-4 pt-0 sm:px-4 sm:pb-5">
        {loading ? (
          <LoadingList />
        ) : error ? (
          <ErrorState
            title="Could not load recent documents"
            message={error}
            onRetry={onRetry}
          />
        ) : !documents || documents.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No documents yet"
            description="Recently modified documents will appear here."
            className="py-4"
          >
            <Button type="button" size="sm" variant="outline" className="ws-btn mt-1 h-9 rounded-[10px]" onClick={() => navigate('/documents')}>
              Open Documents
            </Button>
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-0.5">
            {documents.map((doc, idx) => (
              <DocRow
                key={doc.id}
                doc={doc}
                onOpen={handleOpen}
                showSeparator={idx < documents.length - 1}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
