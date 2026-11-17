import {
  FilePlus2,
  FolderPlus,
  Moon,
  Plus,
  Search,
  Star,
  Sun,
  Tag,
  Trash2,
} from 'lucide-react'
import IconButton from '../common/IconButton.jsx'
import LoadingSkeleton from '../common/LoadingSkeleton.jsx'
import SidebarSection from '../common/SidebarSection.jsx'

/**
 * Left sidebar: workspace selector, search, create buttons, favorites,
 * tags, trash and the folder tree. Phase A renders the structure with
 * loading skeletons; the sections are wired to their hooks in Phase B.
 */
export default function LeftSidebar({ theme, onToggleTheme }) {
  return (
    <aside className="docs-pane docs-pane-left" aria-label="Document library">
      <div className="docs-pane-header">
        <span className="docs-pane-title">Library</span>
        <IconButton
          icon={theme === 'dark' ? Sun : Moon}
          label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          small
          onClick={onToggleTheme}
        />
      </div>

      <div className="docs-pane-scroll">
        <SidebarSection
          title="Workspace"
          action={<IconButton icon={Plus} label="Create workspace" small disabled />}
        >
          <LoadingSkeleton rows={1} />
        </SidebarSection>

        <SidebarSection title="Create">
          <div className="docs-create-stack">
            <button type="button" className="docs-btn docs-btn--primary" disabled>
              <FilePlus2 size={14} aria-hidden="true" />
              New document
            </button>
            <button type="button" className="docs-btn docs-btn--secondary" disabled>
              <FolderPlus size={14} aria-hidden="true" />
              New folder
            </button>
          </div>
        </SidebarSection>

        <SidebarSection title="Search">
          <div className="docs-search" aria-hidden="true">
            <Search size={14} />
            <input
              type="search"
              className="docs-search-input"
              placeholder="Search documents…"
              disabled
            />
          </div>
        </SidebarSection>

        <SidebarSection title="Favorites" defaultOpen={false}>
          <LoadingSkeleton rows={2} />
        </SidebarSection>

        <SidebarSection title="Tags" defaultOpen={false}>
          <LoadingSkeleton rows={2} />
        </SidebarSection>

        <SidebarSection title="Trash" defaultOpen={false}>
          <LoadingSkeleton rows={1} />
        </SidebarSection>

        <SidebarSection title="Folders">
          <LoadingSkeleton rows={4} />
        </SidebarSection>
      </div>
    </aside>
  )
}
