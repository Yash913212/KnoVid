import type { HTMLAttributes, ReactNode } from 'react'

// The shared glass surface — hairline border, top-edge highlight, depth.
// Pair `hover` for the standard lift. Use for panels, rows and cards.
export function GlassCard({
  hover = false,
  children,
  className = '',
  ...rest
}: { hover?: boolean; children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`glass rounded-xl ${
        hover ? 'card-lift hover:shadow-panel-hover dark:hover:shadow-[0_24px_70px_rgb(0_0_0/0.4)]' : ''
      } ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}
