// Shared shimmer block — every skeleton in the app draws from this.
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`skeleton-shimmer ${className}`} />
}
