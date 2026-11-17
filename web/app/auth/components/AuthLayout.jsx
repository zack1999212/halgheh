import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

/**
 * Shared shell for the authentication pages: page background, centered card,
 * Halgheh branding, heading block and the footer switch link.
 */
export default function AuthLayout({ title, description, children, footer }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10 pb-[max(2.5rem,env(safe-area-inset-bottom,0px))] sm:px-5">
      <main className="w-full max-w-[420px]">
        <Card className="rounded-lg border-border shadow-[var(--shadow-card)]">
          <CardHeader>
            <div className="mb-6 flex items-center gap-2">
              <span
                className="flex size-[30px] items-center justify-center rounded-[var(--radius-sm)] bg-foreground text-background"
                aria-hidden="true"
              >
                <svg viewBox="0 0 24 24" fill="none" className="size-[18px]">
                  <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
                  <circle cx="12" cy="12" r="2.6" fill="currentColor" />
                </svg>
              </span>
              <span className="text-[15px] font-semibold tracking-[-0.01em]">
                Halgheh
              </span>
            </div>

            <CardTitle className="text-2xl leading-tight tracking-[-0.02em]">
              <h1>{title}</h1>
            </CardTitle>
            {description && (
              <CardDescription className="pt-2 text-sm">{description}</CardDescription>
            )}
          </CardHeader>

          <CardContent>{children}</CardContent>

          {footer && (
            <CardFooter className="border-t border-border px-6 py-4">
              <p className="w-full text-center text-[13.5px] text-muted-foreground">
                {footer}
              </p>
            </CardFooter>
          )}
        </Card>
      </main>
    </div>
  )
}
