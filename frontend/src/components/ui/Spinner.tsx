// Brand conic-glow spinner — the single loading ring used across the app.
export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return <span aria-hidden className={`spin-ring block rounded-full ${className}`} />
}
