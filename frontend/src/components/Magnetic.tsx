import { useRef, type ReactNode } from 'react'
import { motion, useMotionValue, useSpring } from 'motion/react'
import { usePrefersReducedMotion } from '../lib/motion'

// Magnetic hover: the element is gently pulled toward the cursor and
// springs back on leave. Driven by motion values + springs so tracking
// stays buttery and never re-renders. Wrap primary CTAs for a tactile feel.
export default function Magnetic({
  children,
  strength = 0.22,
  className = '',
}: {
  children: ReactNode
  strength?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const reduced = usePrefersReducedMotion()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const spring = { stiffness: 190, damping: 16, mass: 0.4 } as const
  const sx = useSpring(x, spring)
  const sy = useSpring(y, spring)

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reduced) return
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    x.set((e.clientX - (r.left + r.width / 2)) * strength)
    y.set((e.clientY - (r.top + r.height / 2)) * strength)
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={() => {
        x.set(0)
        y.set(0)
      }}
      className={`inline-block ${className}`}
      style={{ x: sx, y: sy, willChange: 'transform' }}
    >
      {children}
    </motion.div>
  )
}
