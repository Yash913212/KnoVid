import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { transitions, tw } from '../lib/motion'

type ToastType = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  type: ToastType
  message: string
  progress: number
}

interface ToastCtx {
  toast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastCtx | null>(null)

const TOAST_TTL = 3500
const MAX_TOASTS = 4

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)
  const progressIntervals = useRef<Map<number, ReturnType<typeof setInterval>>>(new Map())

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const interval = progressIntervals.current.get(id)
    if (interval) {
      clearInterval(interval)
      progressIntervals.current.delete(id)
    }
  }, [])

  const toast = useCallback(
    (message: string, type: ToastType = 'info') => {
      const id = ++idRef.current
      const newToast = { id, type, message, progress: 100 }
      setToasts((prev) => [...prev.slice(-(MAX_TOASTS - 1)), newToast])

      // Animate progress bar
      const startTime = Date.now()
      const interval = setInterval(() => {
        const elapsed = Date.now() - startTime
        const progress = Math.max(0, 100 - (elapsed / TOAST_TTL) * 100)
        setToasts((prev) =>
          prev.map((t) => (t.id === id ? { ...t, progress } : t))
        )
        if (progress <= 0) {
          clearInterval(interval)
          progressIntervals.current.delete(id)
        }
      }, 50)
      progressIntervals.current.set(id, interval)

      setTimeout(() => dismiss(id), TOAST_TTL)
    },
    [dismiss]
  )

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end pointer-events-none"
        role="status"
        aria-live="polite"
      >
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 18, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 18, scale: 0.98, transition: transitions.microOut }}
              transition={transitions.contentIn}
              className={`pointer-events-auto flex flex-col gap-1.5 rounded-lg border px-3.5 py-2.5 text-sm ${tw.surface} ${
                t.type === 'success'
                  ? 'border-green-200 bg-white text-green-700 dark:border-green-900/30 dark:bg-green-900/20 dark:text-green-400'
                  : t.type === 'error'
                    ? 'border-red-200 bg-white text-red-600 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-400'
                    : 'border-gray-200 bg-white text-gray-600 dark:border-stone-700 dark:bg-stone-800/50 dark:text-stone-300'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {t.type === 'success' && (
                  <span className="w-4 h-4 rounded-full bg-green-500 text-white flex items-center justify-center shrink-0">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                      <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                )}
                {t.type === 'error' && (
                  <span className="w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center shrink-0">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                    </svg>
                  </span>
                )}
                {t.type === 'info' && (
                  <span className="w-4 h-4 rounded-full bg-gray-400 text-white flex items-center justify-center shrink-0">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                      <path d="M12 11v6M12 7.5v.5" strokeLinecap="round" />
                    </svg>
                  </span>
                )}
                <span className="flex-1">{t.message}</span>
                <button
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss notification"
                  className="ml-2 text-current opacity-50 hover:opacity-100 transition-opacity duration-150 ease-out shrink-0"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              {/* Progress bar */}
              <motion.div
                initial={{ scaleX: 1 }}
                animate={{ scaleX: t.progress / 100 }}
                transition={{ duration: TOAST_TTL / 1000, ease: 'linear' }}
                className="absolute bottom-0 left-0 h-0.5 rounded-b-lg"
                style={{
                  background:
                    t.type === 'success'
                      ? '#22c55e'
                      : t.type === 'error'
                        ? '#ef4444'
                        : '#6b7280',
                }}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}