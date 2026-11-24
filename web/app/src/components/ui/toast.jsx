import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

const ToastContext = React.createContext(null)

let toastCount = 0
function genId() { toastCount = (toastCount + 1) % Number.MAX_SAFE_INTEGER; return String(toastCount) }

export function ToastProvider({ children }) {
  const [toasts, setToasts] = React.useState([])
  const timers = React.useRef(new Map())

  const dismiss = React.useCallback((id) => {
    const t = timers.current.get(id)
    if (t) { clearTimeout(t); timers.current.delete(id) }
    setToasts((prev) => prev.filter((x) => x.id !== id))
  }, [])

  const toast = React.useCallback(({ title, description, variant = "default", duration = 3500 } = {}) => {
    const id = genId()
    setToasts((prev) => [...prev, { id, title, description, variant }])
    if (duration > 0) {
      const timer = setTimeout(() => dismiss(id), duration)
      timers.current.set(id, timer)
    }
    return { id, dismiss: () => dismiss(id) }
  }, [dismiss])

  React.useEffect(() => () => {
    timers.current.forEach(clearTimeout)
    timers.current.clear()
  }, [])

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="fixed bottom-4 right-4 z-[120] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "pointer-events-auto relative grid gap-1 overflow-hidden rounded-[var(--radius-lg)] border p-4 pr-10 shadow-lg transition-all",
              t.variant === "destructive"
                ? "border-destructive/40 bg-destructive text-destructive-foreground"
                : "border-border bg-card text-card-foreground"
            )}
          >
            {t.title && <div className="text-sm font-semibold">{t.title}</div>}
            {t.description && <div className={cn("text-sm", t.variant === "destructive" ? "text-destructive-foreground/90" : "text-muted-foreground")}>{t.description}</div>}
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className={cn("absolute right-2 top-2 rounded-md p-1 opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring", t.variant === "destructive" ? "text-destructive-foreground" : "text-foreground/70")}
              aria-label="Dismiss notification"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = React.useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used within ToastProvider")
  return ctx
}
