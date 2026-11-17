import { cn } from '@/lib/utils'

/**
 * Empty-state block: optional icon mark, title, one line of guidance and an
 * optional action area. Used wherever a surface has nothing to show, so the
 * calendar, the assistant and the workspace all say "nothing here" the same
 * way. Callers keep their own layout by passing `className`.
 */
export default function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  className,
  ...props
}) {
  return (
    <div
      className={cn('flex flex-col items-center text-center', className)}
      {...props}
    >
      {Icon && (
        <span
          className="mb-3 grid size-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-foreground text-background"
          aria-hidden="true"
        >
          <Icon size={17} />
        </span>
      )}

      <h3 className="text-[13.5px] font-semibold tracking-[-0.01em]">
        {title}
      </h3>

      {description && (
        <p className="mt-1 max-w-[290px] text-[12.5px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}

      {children && <div className="mt-3 w-full">{children}</div>}
    </div>
  )
}
