import type { ReactNode } from 'react'

export default function LogoMark({
  compact = false,
  className = '',
}: {
  compact?: boolean
  className?: string
}) {
  return (
    <span className={`brand-lockup ${compact ? 'brand-lockup-compact' : ''} ${className}`}>
      <span className="brand-mark" aria-hidden="true">
        <span className="brand-mark-core" />
        <span className="brand-mark-orbit brand-mark-orbit-a" />
        <span className="brand-mark-orbit brand-mark-orbit-b" />
      </span>
      {!compact && (
        <span className="brand-wordmark">
          Kno<span>Vid</span>
        </span>
      )}
    </span>
  )
}

export function BrandTag({ children }: { children: ReactNode }) {
  return <span className="brand-tag">{children}</span>
}
