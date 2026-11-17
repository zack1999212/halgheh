import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/**
 * Icon-only button.
 *
 * Every icon-only control needs an accessible name, so `label` is required and
 * becomes the `aria-label`. Pass `tooltip` to add the visual hint; the tooltip
 * content defaults to the label. Sizing and colour follow the ghost icon
 * button used across the shell, dialogs and the assistant.
 */
export default function IconButton({
  label,
  tooltip,
  tooltipSide = 'bottom',
  className,
  children,
  ...props
}) {
  const button = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      className={cn(
        'size-7 shrink-0 text-muted-foreground hover:text-foreground',
        className,
      )}
      {...props}
    >
      {children}
    </Button>
  )

  if (!tooltip) {
    return button
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side={tooltipSide}>
        {tooltip === true ? label : tooltip}
      </TooltipContent>
    </Tooltip>
  )
}
