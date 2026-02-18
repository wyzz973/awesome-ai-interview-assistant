import type { ReactNode } from 'react'

type BadgeVariant = 'success' | 'error' | 'warning' | 'info' | 'neutral'

interface StatusBadgeProps {
  variant?: BadgeVariant
  children: ReactNode
  dot?: boolean
  className?: string
}

const variantClasses: Record<BadgeVariant, string> = {
  success: 'bg-accent-success/15 text-accent-success border-accent-success/25',
  error: 'bg-accent-danger/15 text-accent-danger border-accent-danger/25',
  warning: 'bg-accent-warning/15 text-accent-warning border-accent-warning/25',
  info: 'bg-status-info/15 text-status-info border-status-info/25',
  neutral: 'bg-bg-tertiary text-text-secondary border-border-default',
}

const dotColors: Record<BadgeVariant, string> = {
  success: 'bg-accent-success',
  error: 'bg-accent-danger',
  warning: 'bg-accent-warning',
  info: 'bg-status-info',
  neutral: 'bg-text-muted',
}

export default function StatusBadge({
  variant = 'neutral',
  children,
  dot = false,
  className = '',
}: StatusBadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-1.5
        px-2 py-0.5 text-xs font-medium
        rounded-full border
        ${variantClasses[variant]}
        ${className}
      `.trim()}
    >
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />
      )}
      {children}
    </span>
  )
}
