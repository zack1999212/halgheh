import BrandMark from '@/components/shared/BrandMark'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import '../auth.css'

/**
 * Shared shell for the authentication pages: a black/yellow branded panel on
 * large screens and a centered card everywhere. The panel collapses on mobile
 * so the form keeps the full viewport.
 */
export default function AuthLayout({ title, description, children, footer }) {
  return (
    <div className="auth-page flex min-h-dvh bg-background">
      <aside className="auth-showcase relative hidden flex-col overflow-hidden p-10 lg:flex">
        <div className="relative z-10 flex items-center gap-3">
          <BrandMark className="size-9" />
          <span className="text-[17px] font-semibold tracking-[-0.01em]">Halgheh</span>
        </div>

        <div className="relative z-10 my-auto max-w-md">
          <p className="auth-kicker">Plan · Track · Finish</p>
          <h2 className="mt-3 text-[38px] font-bold leading-[1.1] tracking-[-0.03em]">
            One place for your work, milestones and conversations.
          </h2>
          <p className="mt-4 text-[14px] leading-relaxed text-muted-foreground">
            Build a roadmap, attach the tasks that complete each step, and keep
            your workspace in sync.
          </p>

          <div className="mt-8 flex gap-2" aria-hidden="true">
            <span className="auth-pip" />
            <span className="auth-pip" />
            <span className="auth-pip auth-pip--active" />
          </div>
        </div>
      </aside>

      <main className="flex flex-1 items-center justify-center px-4 py-10 pb-[max(2.5rem,env(safe-area-inset-bottom,0px))] sm:px-6">
        <Card className="auth-card w-full max-w-[430px]">
          <CardHeader>
            <div className="mb-6 flex items-center gap-2 lg:hidden">
              <BrandMark />
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
