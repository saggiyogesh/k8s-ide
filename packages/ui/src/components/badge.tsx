import { type HTMLAttributes } from 'react'
import { cn } from '../lib/utils.js'

export function Badge({
  className,
  variant = 'default',
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: 'default' | 'secondary' | 'outline' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variant === 'default' && 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]',
        variant === 'secondary' && 'bg-[var(--color-muted)] text-[var(--color-foreground)]',
        variant === 'outline' && 'border border-[var(--color-border)]',
        className,
      )}
      {...props}
    />
  )
}
