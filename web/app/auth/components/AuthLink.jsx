import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

/**
 * Inline link for the authentication pages (the login/register switch).
 * Shares the monochrome link treatment so both pages stay identical.
 */
export default function AuthLink({ to, className, children, ...props }) {
  return (
    <Link
      to={to}
      className={cn(
        'rounded-sm font-medium text-foreground underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        className,
      )}
      {...props}
    >
      {children}
    </Link>
  )
}
