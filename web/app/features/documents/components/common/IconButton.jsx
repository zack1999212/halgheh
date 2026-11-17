/**
 * Small square button that shows only an icon. Every instance must pass a
 * `label`, which is used as the accessible name and native tooltip.
 * Extra props (onClick, disabled, aria-*, ...) are forwarded to the button.
 */
export default function IconButton({
  icon: Icon,
  label,
  small = false,
  active = false,
  className = '',
  children,
  ...rest
}) {
  const classes = [
    'docs-icon-btn',
    small ? 'docs-icon-btn--small' : '',
    active ? 'is-active' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type="button" className={classes} aria-label={label} title={label} {...rest}>
      {children || (Icon ? <Icon size={small ? 14 : 16} aria-hidden="true" /> : null)}
    </button>
  )
}
