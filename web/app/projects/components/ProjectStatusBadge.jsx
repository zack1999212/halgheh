import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { PROJECT_STATUS_LABELS } from '../utils/projectConstants.js'

const STYLES = {
  active: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  on_hold: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
  completed: 'border-sky-400/30 bg-sky-400/10 text-sky-200',
  archived: 'border-white/15 bg-white/5 text-white/70',
}

export default function ProjectStatusBadge({ status, className }) {
  const label = PROJECT_STATUS_LABELS[status] || status || 'Unknown'
  return (
    <Badge
      variant="outline"
      className={cn('font-medium', STYLES[status] || 'border-white/15 bg-white/5 text-white/80', className)}
    >
      {label}
    </Badge>
  )
}
