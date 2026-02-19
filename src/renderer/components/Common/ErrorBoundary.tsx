import { Component, type ReactNode, type ErrorInfo } from 'react'
import { getLogger } from '../../utils/logger'

const log = getLogger('ErrorBoundary')

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    log.error('UI 渲染错误', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="flex flex-col items-center justify-center h-full p-6 text-center">
          <p className="text-sm text-accent-danger mb-2">渲染出错</p>
          <p className="text-xs text-text-muted mb-4 max-w-sm break-all">
            {this.state.error?.message}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-3 py-1.5 text-xs rounded-md bg-bg-tertiary text-text-secondary border border-border-default hover:border-border-focus"
          >
            重试
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
