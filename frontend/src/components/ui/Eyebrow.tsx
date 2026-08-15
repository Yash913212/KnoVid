import type { ReactNode } from 'react'

type Tone = 'default' | 'tangerine' | 'orchid'

// Standardized small-caps label above section headings.
export function Eyebrow({
  children,
  tone = 'default',
  className = '',
}: {
  children: ReactNode
  tone?: Tone
  className?: string
}) {
  const tones: Record<Tone, string> = {
    default: 'text-stone-400 dark:text-stone-500',
    tangerine: 'text-[#1D7773] dark:text-[#73CEC2]',
    orchid: 'text-[#7E3AF2] dark:text-[#E3C4FF]',
  }
  return <p className={`eyebrow ${tones[tone]} ${className}`}>{children}</p>
}
