import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { Loader2 } from 'lucide-react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-accent-primary text-white hover:bg-accent-primary-hover active:bg-accent-primary-hover/90 border-transparent',
  secondary:
    'bg-bg-tertiary text-text-primary hover:bg-bg-hover border-border-default',
  ghost:
    'bg-transparent text-text-secondary hover:bg-bg-hover hover:text-text-primary border-transparent',
  danger:
    'bg-accent-danger/10 text-accent-danger hover:bg-accent-danger/20 border-accent-danger/30',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs rounded-md gap-1',
  md: 'h-9 px-3.5 text-sm rounded-lg gap-1.5',
  lg: 'h-11 px-5 text-base rounded-lg gap-2',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, disabled, className = '', children, ...props }, ref) => {
    const isDisabled = disabled || loading

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={`
          inline-flex items-center justify-center font-medium border
          transition-colors duration-150 cursor-pointer select-none
          disabled:opacity-50 disabled:cursor-not-allowed
          ${variantClasses[variant]}
          ${sizeClasses[size]}
          ${className}
        `.trim()}
        {...props}
      >
        {loading && <Loader2 className="animate-spin" size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} />}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'

export default Button
