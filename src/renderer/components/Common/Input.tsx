import { type InputHTMLAttributes, forwardRef, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  error?: string
  size?: 'sm' | 'md' | 'lg'
}

const sizeClasses = {
  sm: 'h-7 px-2.5 text-xs rounded-md',
  md: 'h-9 px-3 text-sm rounded-lg',
  lg: 'h-11 px-4 text-base rounded-lg',
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, size = 'md', type, className = '', ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false)
    const isPassword = type === 'password'
    const inputType = isPassword && showPassword ? 'text' : type

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label className="text-xs font-medium text-text-secondary">{label}</label>
        )}
        <div className="relative">
          <input
            ref={ref}
            type={inputType}
            className={`
              w-full bg-bg-tertiary text-text-primary
              border border-border-default
              placeholder:text-text-muted
              focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus/30
              transition-colors duration-150
              disabled:opacity-50 disabled:cursor-not-allowed
              ${error ? 'border-accent-danger focus:border-accent-danger focus:ring-accent-danger/30' : ''}
              ${isPassword ? 'pr-9' : ''}
              ${sizeClasses[size]}
              ${className}
            `.trim()}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors cursor-pointer bg-transparent border-none p-0"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          )}
        </div>
        {error && <p className="text-xs text-accent-danger">{error}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'

export default Input
