import { Sparkles } from 'lucide-react'
import LoadingSkeleton from '../common/LoadingSkeleton.jsx'
import SidebarSection from '../common/SidebarSection.jsx'

/**
 * Right sidebar: document properties, tags, backlinks, related documents
 * and the AI assistant stub. Wired to their hooks in Phases C and D.
 */
export default function RightSidebar() {
  return (
    <aside className="docs-pane docs-pane-right" aria-label="Document details">
      <SidebarSection title="Properties">
        <LoadingSkeleton rows={3} />
      </SidebarSection>

      <SidebarSection title="Tags">
        <LoadingSkeleton rows={2} />
      </SidebarSection>

      <SidebarSection title="Backlinks">
        <LoadingSkeleton rows={2} />
      </SidebarSection>

      <SidebarSection title="Related documents">
        <LoadingSkeleton rows={2} />
      </SidebarSection>

      <SidebarSection title="Assistant" defaultOpen={false}>
        <div className="docs-assistant-stub">
          <span className="docs-assistant-icon" aria-hidden="true">
            <Sparkles size={16} />
          </span>
          <p className="docs-assistant-text">
            Outline and summary helpers work locally. Backend AI actions are
            coming soon.
          </p>
        </div>
      </SidebarSection>
    </aside>
  )
}
