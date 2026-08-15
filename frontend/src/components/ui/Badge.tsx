import type { HTMLAttributes, ReactNode } from 'react'

type Tone = 'default' | 'tangerine' | 'orchid' | 'danger' | 'success'

// The one pill/badge in the app. Replaces Chip, MagicPill and inline pill spans.
export function Badge({
  tone = 'default',
  children,
  className = '',
  ...rest
}: { tone?: Tone; children: ReactNode } & HTMLAttributes<HTMLSpanElement>) {
  const tones: Record<Tone, string> = {
    default:
      'border-black/[0.08] bg-white/70 text-stone-600 shadow-panel dark:border-white/10 dark:bg-white/[0.05] dark:text-stone-300',
    tangerine:
      'border-[#B8D96B]/40 bg-[#B8D96B]/10 text-[#5a7200] dark:border-[#B8D96B]/30 dark:text-[#B8D96B]',
    orchid:
      'border-[#B06AE0]/40 bg-[#B06AE0]/10 text-[#8A48D0] dark:border-[#B06AE0]/30 dark:text-[#CDA3FF]',
    danger: 'border-red-500/30 bg-red-500/10 text-red-700 dark:border-red-500/25 dark:text-red-300',
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/25 dark:text-emerald-300',
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium backdrop-blur-xl ${tones[tone]} ${className}`}
      {...rest}
    >
      {children}
    </span>
  )
}
