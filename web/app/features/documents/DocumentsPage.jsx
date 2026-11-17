import { useParams } from 'react-router-dom'
import { FileText } from 'lucide-react'
import EmptyState from './components/common/EmptyState.jsx'
import LoadingSkeleton from './components/common/LoadingSkeleton.jsx'
import LeftSidebar from './components/layout/LeftSidebar.jsx'
import RightSidebar from './components/layout/RightSidebar.jsx'
import { useTheme } from './hooks/useTheme.js'
import './documents.css'

/**
 * Document Management screen: Obsidian-style three-pane layout.
 *
 * Route shapes (see src/App.jsx):
 *   /documents            — no document selected
 *   /documents/:documentId — that document in the center editor
 *
 * Selection state for workspace / folder / sidebar filter lives here from
 * Phase B; the editor replaces the center placeholder in Phase C.
 */
export default function DocumentsPage() {
  const { documentId } = useParams()
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="docs-root" data-theme={theme}>
      <LeftSidebar theme={theme} onToggleTheme={toggleTheme} />

      <main className="docs-center" aria-label="Document editor">
        {documentId ? (
          <LoadingSkeleton variant="block" label="Loading document" />
        ) : (
          <EmptyState
            icon={FileText}
            title="No document selected"
            description="Pick a document from the library on the left, or create a new one to start writing."
          />
        )}
      </main>

      <RightSidebar />
    </div>
  )
}
