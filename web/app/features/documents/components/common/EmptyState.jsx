/** Shared empty-state message for lists and panels. */
export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="docs-empty">
      {Icon && (
        <span className="docs-empty-icon" aria-hidden="true">
          <Icon size={20} />
        </span>
      )}
      <p className="docs-empty-title">{title}</p>
      {description && <p className="docs-empty-description">{description}</p>}
      {action && <div className="docs-empty-action">{action}</div>}
    </div>
  )
}
