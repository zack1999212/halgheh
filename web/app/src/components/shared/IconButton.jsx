import * as React from 'react'
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
 *
 * The component forwards its ref to the underlying button because Radix
 * triggers (`DropdownMenuTrigger`, `TooltipTrigger`, …) use `asChild` and need
 * that ref to measure and anchor their floating content.
 */
const IconButton = React.forwardRef(function IconButton(
  { label, tooltip, tooltipSide = 'bottom', className, children, ...props },
  ref,
) {
  const button = (
    <Button
      ref={ref}
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
})

IconButton.displayName = 'IconButton'

export default IconButton
