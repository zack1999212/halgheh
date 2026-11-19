import { Construction } from 'lucide-react'
import EmptyState from '@/components/shared/EmptyState'

const LABELS = {
  tasks: 'Tasks',
  documents: 'Documents',
  calendar: 'Calendar',
  milestones: 'Milestones',
  members: 'Members',
}

export default function ProjectSectionPlaceholder({ section = 'section' }) {
  const label = LABELS[section] || 'This section'
  return (
    <div className="project-overview-surface flex min-h-[320px] items-center justify-center p-8">
      <EmptyState
        icon={Construction}
        title={`${label} is not yet available`}
        description="This project section is part of the Projects workspace navigation and will be implemented in a later phase."
      />
    </div>
  )
}
