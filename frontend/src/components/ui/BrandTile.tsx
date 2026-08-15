import type { ReactNode } from 'react'

type Size = 'sm' | 'md' | 'lg'

// Gradient orchid→violet icon tile — the brand mark treatment used for
// logos, stat icons and step tiles. One source, consistent glow + ring.
export function BrandTile({
  children,
  size = 'md',
  glow = true,
  className = '',
}: {
  children: ReactNode
  size?: Size
  glow?: boolean
  className?: string
}) {
  const sizes: Record<Size, string> = {
    sm: 'h-8 w-8 rounded-lg',
    md: 'h-9 w-9 rounded-xl',
    lg: 'h-12 w-12 rounded-2xl',
  }
  return (
    <span
      className={`grid shrink-0 place-items-center bg-gradient-to-br from-[#A855F7] to-[#E3C4FF] text-white ring-1 ring-white/25 ${sizes[size]} ${
        glow ? 'shadow-[0_0_20px_rgb(168_85_247/0.45)]' : ''
      } ${className}`}
    >
      {children}
    </span>
  )
}
