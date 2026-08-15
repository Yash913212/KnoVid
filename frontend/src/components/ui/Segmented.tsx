import { motion } from 'motion/react'
import type { ReactNode } from 'react'

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
  disabled?: boolean
  title?: string
}

// One segmented control for the whole app (grid/list, filters, tabs, views).
// Accessible: real tablist/tab/aria-selected semantics.
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  layoutId = 'seg-pill',
  className = '',
}: {
  value: T
  onChange: (value: T) => void
  options: SegmentedOption<T>[]
  size?: 'sm' | 'md'
  layoutId?: string
  className?: string
}) {
  return (
    <div
      role="tablist"
      className={`inline-flex gap-1 rounded-full border border-black/[0.08] bg-white/70 p-1 shadow-panel backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.05] ${className}`}
    >
      {options.map((o) => {
        const active = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            title={o.title}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={`relative rounded-full font-semibold transition-all duration-200 ease-out ${
              size === 'sm' ? 'px-3 py-1 text-xs' : 'px-3.5 py-1.5 text-sm'
            } ${
              o.disabled
                ? 'cursor-not-allowed text-stone-300 dark:text-stone-600'
                : active
                  ? 'text-white'
                  : 'text-stone-500 hover:bg-white/80 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800/70 dark:hover:text-stone-100'
            }`}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 -z-10 rounded-full bg-gradient-to-r from-[#2BA6A0] to-[#C17EF9] shadow-[0_4px_16px_rgb(193_126_249/0.35)]"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              />
            )}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
