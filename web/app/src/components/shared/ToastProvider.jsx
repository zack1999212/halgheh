import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const ToastContext = createContext(null)

const VARIANT = {
  success: { icon: CheckCircle2, className: 'border-emerald-200 bg-card text-foreground dark:border-emerald-900/60' },
  error: { icon: AlertCircle, className: 'border-destructive/30 bg-card text-foreground' },
  warning: { icon: TriangleAlert, className: 'border-amber-200 bg-card text-foreground dark:border-amber-900/60' },
  info: { icon: Info, className: 'border-border bg-card text-foreground' },
}

function ToastItem({ toast, onDismiss }) {
  const variant = VARIANT[toast.variant] || VARIANT.info
  const Icon = variant.icon
  return (
    <div
      role={toast.variant === 'error' ? 'alert' : 'status'}
      aria-live={toast.variant === 'error' ? 'assertive' : 'polite'}
      className={cn(
        'pointer-events-auto flex w-full max-w-[360px] items-start gap-2.5 rounded-lg border px-3 py-2.5 shadow-sm',
        variant.className,
      )}
    >
      <Icon size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        {toast.title ? <p className="text-[13px] font-medium leading-5">{toast.title}</p> : null}
        {toast.message ? <p className="text-[12.5px] leading-5 text-muted-foreground">{toast.message}</p> : null}
      </div>
      <button
        type="button"
        className="shrink-0 rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(toast.id)}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  )
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())
  const idRef = useRef(0)

  const dismiss = useCallback((id) => {
    const timer = timers.current.get(id)
    if (timer) {
      window.clearTimeout(timer)
      timers.current.delete(id)
    }
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const push = useCallback((input) => {
    const id = ++idRef.current
    const toast = {
      id,
      variant: input.variant || 'info',
      title: input.title || '',
      message: input.message || '',
      duration: input.duration ?? (input.variant === 'error' ? 5000 : 2800),
    }
    setToasts((current) => [...current.filter((t) => !(input.dedupeKey && t.dedupeKey === input.dedupeKey)), { ...toast, dedupeKey: input.dedupeKey }])
    if (toast.duration > 0) {
      const timer = window.setTimeout(() => dismiss(id), toast.duration)
      timers.current.set(id, timer)
    }
    return id
  }, [dismiss])

  const api = useMemo(() => ({
    push,
    dismiss,
    success: (message, opts = {}) => push({ ...opts, variant: 'success', message }),
    error: (message, opts = {}) => push({ ...opts, variant: 'error', message }),
    warning: (message, opts = {}) => push({ ...opts, variant: 'warning', message }),
    info: (message, opts = {}) => push({ ...opts, variant: 'info', message }),
  }), [push, dismiss])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-3 sm:inset-x-auto sm:right-4 sm:items-end">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
