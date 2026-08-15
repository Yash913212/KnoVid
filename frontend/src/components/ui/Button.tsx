import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Spinner } from './Spinner'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'sheen-button bg-[#A855F7] text-white shadow-[0_10px_30px_rgb(168_85_247/0.24)] ring-1 ring-[#E3C4FF]/60 hover:-translate-y-0.5 hover:bg-[#C084FC] hover:shadow-[0_16px_44px_rgb(168_85_247/0.36)] active:scale-[0.985]',
  secondary:
    'border border-black/[0.1] bg-white/70 text-stone-700 shadow-panel backdrop-blur-xl hover:border-[#A855F7]/70 hover:text-stone-950 dark:border-white/15 dark:bg-white/[0.05] dark:text-stone-200 dark:hover:border-[#E3C4FF]/70 dark:hover:text-[#E6C9FF]',
  ghost:
    'text-stone-500 hover:bg-white/80 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800/70 dark:hover:text-stone-100',
  danger:
    'border border-red-400/30 text-red-300 hover:border-red-400/60 hover:bg-red-400/10 hover:text-red-200 dark:border-red-400/25 dark:text-red-300/90',
}

const SIZES: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-sm',
}

// Primary gradient action. The `radius` prop lets call sites match their
// container's corner language without forking the styling.
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  className = '',
  disabled,
  radius = 'full',
  ...rest
}: ButtonProps & { radius?: 'full' | 'xl' | '2xl' }) {
  const radii = { full: 'rounded-full', xl: 'rounded-xl', '2xl': 'rounded-2xl' } as const
  return (
    <button
      disabled={disabled || loading}
      className={`relative inline-flex items-center justify-center gap-2 font-semibold transition-all duration-200 ease-out disabled:pointer-events-none disabled:opacity-50 ${radii[radius]} ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {loading ? <Spinner className="h-4 w-4" /> : icon}
      {children}
    </button>
  )
}
