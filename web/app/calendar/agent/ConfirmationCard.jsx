import { useEffect, useState } from 'react'
import { CircleAlert } from 'lucide-react'
import {
  actionConsequence,
  changedFields,
  formatDateTime,
  parseActionSummary,
} from './format.js'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'

function scopeLabel(scope) {
  if (!scope) return ''
  return scope.charAt(0).toUpperCase() + scope.slice(1)
}

/**
 * Renders a pending action returned by the agent backend. Approval and
 * rejection always go through the backend confirmation endpoints; this card
 * never performs a calendar operation itself.
 */
export default function ConfirmationCard({
  action,
  busy = false,
  busyLabel = 'Working…',
  error = '',
  onApprove,
  onReject,
}) {
  const [now, setNow] = useState(() => Date.now())
  const preview = parseActionSummary(action?.summary)
  const args = action?.tool_arguments || {}

  const operation = preview.operation || 'Review action'
  const title =
    preview.event ||
    args.title ||
    (args.event_id ? `Event #${args.event_id}` : 'Calendar action')
  const when =
    preview.when ||
    [args.start || args.start_date, args.end || args.end_date]
      .filter(Boolean)
      .map(formatDateTime)
      .join(' → ')
  const timezone = preview.timezone || args.timezone || ''
  const scope = preview.scope || ''
  const changes = preview.changes || changedFields(args)
  const occurrence = preview.occurrence || args.occurrence_start || ''

  const expiresAt = action?.expires_at
    ? new Date(action.expires_at).getTime()
    : null

  useEffect(() => {
    if (!expiresAt) return undefined
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [expiresAt])

  const expired = expiresAt !== null && expiresAt <= now
  const details = [
    when ? ['When', when] : null,
    timezone ? ['Timezone', timezone] : null,
    scope ? ['Scope', scopeLabel(scope)] : null,
    occurrence ? ['Occurrence', formatDateTime(occurrence)] : null,
    changes ? ['Changes', changes] : null,
  ].filter(Boolean)

  return (
    <Card
      className={cn(
        'border-border bg-card shadow-none',
        expired && 'opacity-70',
      )}
      aria-label={`${operation} for ${title}`}
    >
      <CardHeader className="gap-1 p-3 pb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-medium">
            {operation}
          </Badge>
          {scope && (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-medium">
              {scopeLabel(scope)}
            </Badge>
          )}
        </div>
        <CardTitle className="text-[13px] font-semibold leading-snug">
          {title}
        </CardTitle>
      </CardHeader>

      <CardContent className="grid gap-2 p-3 pt-0">
        {details.length > 0 && (
          <dl className="grid gap-1">
            {details.map(([label, value]) => (
              <div key={label} className="flex gap-2 text-[11.5px]">
                <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
                <dd className="min-w-0 break-words">{value}</dd>
              </div>
            ))}
          </dl>
        )}

        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          {expired
            ? 'This request expired and can no longer be approved.'
            : actionConsequence(action?.tool_name)}
        </p>

        {!expired && expiresAt && (
          <p className="text-[10.5px] text-muted-foreground/80">
            Expires {formatDateTime(action.expires_at)}
          </p>
        )}

        {error && (
          <Alert variant="destructive" className="px-2.5 py-2">
            <CircleAlert aria-hidden="true" />
            <AlertDescription className="text-[11.5px]">
              {error}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-end gap-2 pt-0.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={onReject}
            disabled={busy || expired}
          >
            {busy && busyLabel.startsWith('Reject') ? busyLabel : 'Reject'}
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8"
            onClick={onApprove}
            disabled={busy || expired}
          >
            {busy && busyLabel.startsWith('Approv') ? busyLabel : 'Approve'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
