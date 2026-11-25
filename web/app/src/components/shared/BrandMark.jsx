/** Halgheh brand glyph, shared by the app header and authentication screens. */
export default function BrandMark({ className = 'size-[30px]' }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-border bg-foreground text-background ${className}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-[60%]">
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="12" r="2.6" fill="currentColor" />
      </svg>
    </span>
  )
}
