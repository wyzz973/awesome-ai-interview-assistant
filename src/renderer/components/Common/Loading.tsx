import { Loader2 } from 'lucide-react'

interface SpinnerProps {
  size?: number
  className?: string
}

export function Spinner({ size = 24, className = '' }: SpinnerProps) {
  return (
    <Loader2
      size={size}
      className={`animate-spin text-accent-primary ${className}`}
    />
  )
}

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-shimmer rounded-md ${className}`}
      aria-hidden="true"
    />
  )
}

interface LoadingProps {
  text?: string
  size?: number
}

export default function Loading({ text, size = 24 }: LoadingProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8">
      <Spinner size={size} />
      {text && <p className="text-sm text-text-secondary">{text}</p>}
    </div>
  )
}
