'use client'

import { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from 'react'

export type ToastVariant = 'success' | 'error' | 'info' | 'warning'

export interface ToastItem {
  id: string
  variant: ToastVariant
  title: string
  description?: string
  duration?: number
}

interface ToastContextValue {
  addToast: (toast: Omit<ToastItem, 'id'>) => void
  removeToast: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    const t = timers.current.get(id)
    if (t) { clearTimeout(t); timers.current.delete(id) }
  }, [])

  const addToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = Math.random().toString(36).slice(2)
    const duration = toast.duration ?? 4000
    setToasts(prev => [...prev, { ...toast, id }])
    if (duration > 0) {
      const t = setTimeout(() => removeToast(id), duration)
      timers.current.set(id, t)
    }
  }, [removeToast])

  useEffect(() => {
    const t = timers.current
    return () => { t.forEach(clearTimeout) }
  }, [])

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={removeToast} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

const variantConfig: Record<ToastVariant, { container: string; iconPath: string; iconColor: string }> = {
  success: {
    container: 'border-green-200 bg-green-50',
    iconColor: 'text-green-600',
    iconPath: 'M5 13l4 4L19 7',
  },
  error: {
    container: 'border-red-200 bg-red-50',
    iconColor: 'text-red-600',
    iconPath: 'M6 18L18 6M6 6l12 12',
  },
  warning: {
    container: 'border-amber-200 bg-amber-50',
    iconColor: 'text-amber-600',
    iconPath: 'M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z',
  },
  info: {
    container: 'border-blue-200 bg-blue-50',
    iconColor: 'text-blue-600',
    iconPath: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
}

function ToastViewport({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none"
    >
      {toasts.map(toast => {
        const { container, iconPath, iconColor } = variantConfig[toast.variant]
        return (
          <div
            key={toast.id}
            role="alert"
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg ${container}`}
          >
            <svg className={`w-4 h-4 mt-0.5 flex-shrink-0 ${iconColor}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">{toast.title}</p>
              {toast.description && (
                <p className="text-xs text-gray-600 mt-0.5">{toast.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="flex-shrink-0 p-0.5 mt-0.5 rounded text-gray-400 hover:text-gray-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-400"
              aria-label="Dismiss"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )
      })}
    </div>
  )
}
