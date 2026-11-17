/** Human-friendly timestamps for the editor status bar and lists. */

export function formatRelativeTime(isoString) {
  if (!isoString) return ''
  const then = new Date(isoString)
  if (Number.isNaN(then.getTime())) return ''

  const seconds = Math.round((Date.now() - then.getTime()) / 1000)
  if (seconds < 45) return 'just now'

  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`

  const days = Math.round(hours / 24)
  if (days < 7) return `${days} d ago`

  const sameYear = then.getFullYear() === new Date().getFullYear()
  return then.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

export function formatFullTime(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}
