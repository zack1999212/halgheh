/**
 * Loading placeholder shimmer, used while lists, trees and panels load.
 * `rows` renders that many lines; `variant="block"` renders one tall block
 * (e.g. for the editor area).
 */
export default function LoadingSkeleton({ rows = 3, variant = 'text', label = 'Loading' }) {
  return (
    <div
      className={`docs-skeleton docs-skeleton--${variant}`}
      role="status"
      aria-label={label}
    >
      {variant === 'block' ? (
        <span className="docs-skeleton-line docs-skeleton-line--block" />
      ) : (
        Array.from({ length: rows }, (_, index) => (
          <span
            key={index}
            className={`docs-skeleton-line docs-skeleton-line--w${(index % 3) + 1}`}
          />
        ))
      )}
    </div>
  )
}
