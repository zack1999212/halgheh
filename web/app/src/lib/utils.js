import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge conditional class names and resolve conflicting Tailwind utilities,
 * so component `className` props can override variant styles.
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
