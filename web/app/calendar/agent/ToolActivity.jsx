import { Check, CircleAlert, Clock } from 'lucide-react'
import { toolLabel, toolStatus } from './format.js'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const TONE_ICON = {
  error: 'bg-destructive/10 text-destructive',
  pending: 'bg-amber-100 text-amber-700',
  done: 'bg-emerald-100 text-emerald-700',
}

/** Compact, non-intrusive row describing one backend tool execution. */
export default function ToolActivity({ message }) {
  const { label, tone } = toolStatus(message)
  const result = message?.tool_result || {}
  const summary = result.summary || result.message || result.error || ''
  const Icon = tone === 'error' ? CircleAlert : tone === 'pending' ? Clock : Check

  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-[var(--radius-sm)] border border-border bg-muted/40 px-2.5 py-1.5',
        tone === 'error' && 'border-destructive/30 bg-destructive/5',
      )}
    >
      <span
        className={cn(
          'mt-0.5 grid size-4 shrink-0 place-items-center rounded-full',
          TONE_ICON[tone] || TONE_ICON.done,
        )}
        aria-hidden="true"
      >
        <Icon size={10} />
      </span>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] font-medium">
            {toolLabel(message?.tool_name)}
          </span>
          <Badge
            variant={tone === 'error' ? 'destructive' : 'outline'}
            className={cn(
              'px-1.5 py-0 text-[10px] font-medium',
              tone === 'pending' &&
                'border-amber-300/60 bg-amber-50 text-amber-700',
            )}
          >
            {label}
          </Badge>
        </div>
        {summary && (
          <p className="mt-0.5 break-words text-[11.5px] leading-relaxed text-muted-foreground">
            {summary}
          </p>
        )}
      </div>
    </div>
  )
}
