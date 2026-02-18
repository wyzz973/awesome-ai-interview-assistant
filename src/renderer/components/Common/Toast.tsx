import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle, XCircle, Info, X } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'info'

interface ToastItem {
  id: string
  type: ToastType
  message: string
  exiting?: boolean
}

const icons: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
}

const typeClasses: Record<ToastType, string> = {
  success: 'border-accent-success/30 text-accent-success',
  error: 'border-accent-danger/30 text-accent-danger',
  info: 'border-status-info/30 text-status-info',
}

// 全局 toast 管理
let addToastFn: ((type: ToastType, message: string, duration?: number) => void) | null = null

/** 外部调用入口 */
export const toast = {
  success: (message: string, duration?: number) => addToastFn?.('success', message, duration),
  error: (message: string, duration?: number) => addToastFn?.('error', message, duration),
  info: (message: string, duration?: number) => addToastFn?.('info', message, duration),
}

function ToastEntry({ item, onRemove }: { item: ToastItem; onRemove: (id: string) => void }) {
  const Icon = icons[item.type]

  return (
    <div
      className={`
        flex items-center gap-2.5 px-4 py-3
        bg-bg-elevated border rounded-lg shadow-lg
        ${item.exiting ? 'toast-exit' : 'toast-enter'}
        ${typeClasses[item.type]}
      `.trim()}
      role="alert"
    >
      <Icon size={18} className="shrink-0" />
      <span className="text-sm text-text-primary flex-1">{item.message}</span>
      <button
        onClick={() => onRemove(item.id)}
        className="text-text-muted hover:text-text-secondary transition-colors cursor-pointer bg-transparent border-none p-0 shrink-0"
      >
        <X size={14} />
      </button>
    </div>
  )
}

let idCounter = 0

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    )
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 150)
  }, [])

  const addToast = useCallback(
    (type: ToastType, message: string, duration = 3000) => {
      const id = `toast-${++idCounter}`
      setToasts((prev) => [...prev, { id, type, message }])
      setTimeout(() => removeToast(id), duration)
    },
    [removeToast]
  )

  useEffect(() => {
    addToastFn = addToast
    return () => {
      addToastFn = null
    }
  }, [addToast])

  if (toasts.length === 0) return null

  return createPortal(
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm">
      {toasts.map((item) => (
        <ToastEntry key={item.id} item={item} onRemove={removeToast} />
      ))}
    </div>,
    document.body
  )
}
