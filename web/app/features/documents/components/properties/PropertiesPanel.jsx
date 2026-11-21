import { Separator } from '@/components/ui/separator'
import EmptyState from '@/components/shared/EmptyState.jsx'
import ErrorState from '@/components/shared/ErrorState.jsx'
import TagsSection from './TagsSection.jsx'
import LinksSection from './LinksSection.jsx'
import VersionHistorySection from './VersionHistorySection.jsx'
import { formatFullTime } from '../../utils/formatTime.js'

function Section({ title, children }) {
  return (
    <section aria-label={title} className="grid gap-2">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  )
}

function MetaRow({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right">{children}</dd>
    </div>
  )
}

/**
 * Right sidebar for the open document: folder + timestamps, tags, explicit
 * links (related) and backlinks. Everything shown comes from the document
 * detail / links / tags endpoints — nothing is fabricated.
 */
export default function PropertiesPanel({
  document,
  tags,
  links,
  documents,
  onAttachTag,
  onDetachTag,
  onCreateTag,
  onUpdateTag,
  onDeleteTag,
  onCreateLink,
  onRemoveLink,
  onOpenDocument,
  onRestoreVersion,
}) {
  if (!document) {
    return (
      <EmptyState
        className="flex-1 justify-center px-6"
        title="No document selected"
        description="Open a document to see its properties, tags and backlinks."
      />
    )
  }

  return (
    <div className="grid content-start gap-4 pb-4 pt-2">
      <Section title="Properties">
        <dl className="grid gap-1.5">
          <MetaRow label="Folder">
            {document.folder ? document.folder.name : 'Workspace root'}
          </MetaRow>
          <MetaRow label="Created">{formatFullTime(document.created_at)}</MetaRow>
          <MetaRow label="Modified">{formatFullTime(document.updated_at)}</MetaRow>
          {document.is_archived && <MetaRow label="Status">Archived</MetaRow>}
          {document.is_deleted && <MetaRow label="Status">In trash</MetaRow>}
        </dl>
      </Section>

      <Separator />

      {tags.status === 'error' ? (
        <ErrorState
          message="The workspace tag catalog could not be loaded."
          onRetry={tags.reload}
          className="text-[12px]"
        />
      ) : (
        <Section title="Tags">
          <TagsSection
            document={document}
            tags={tags}
            onAttach={onAttachTag}
            onDetach={onDetachTag}
            onCreateTag={onCreateTag}
            onUpdateTag={onUpdateTag}
            onDeleteTag={onDeleteTag}
          />
        </Section>
      )}

      <Separator />

      <Section title="Links">
        {links.status === 'loading' ? (
          <div className="grid gap-2 py-1" role="status" aria-label="Loading links">
            <div className="h-2.5 w-2/3 animate-pulse rounded-md bg-primary/10" />
            <div className="h-2.5 w-1/2 animate-pulse rounded-md bg-primary/10" />
          </div>
        ) : links.status === 'error' ? (
          <ErrorState
            message="Links could not be loaded."
            onRetry={links.reload}
            className="text-[12px]"
          />
        ) : (
          <LinksSection
            document={document}
            links={links}
            documents={documents}
            onCreateLink={onCreateLink}
            onRemoveLink={onRemoveLink}
            onOpenDocument={onOpenDocument}
          />
        )}
      </Section>

      <Separator />

      <Section title="Version history">
        <VersionHistorySection
          document={document}
          onRestoreVersion={onRestoreVersion}
        />
      </Section>
    </div>
  )
}
