import { useEffect, useRef } from 'react'
import { motion, useMotionValue, useSpring } from 'motion/react'
import { usePrefersReducedMotion } from '../lib/motion'

// Soft radiant halo that trails the cursor with GPU composition.
export default function CursorGlow() {
  const reduced = usePrefersReducedMotion()
  const size = 560
  const x = useMotionValue(-size)
  const y = useMotionValue(-size)
  const sx = useSpring(x, { stiffness: 120, damping: 24, mass: 0.5 })
  const sy = useSpring(y, { stiffness: 120, damping: 24, mass: 0.5 })
  const tx = useSpring(x, { stiffness: 50, damping: 26, mass: 0.9 })
  const ty = useSpring(y, { stiffness: 50, damping: 26, mass: 0.9 })
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (reduced) return
    const move = (e: MouseEvent) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        x.set(e.clientX - size / 2)
        y.set(e.clientY - size / 2)
      })
    }
    window.addEventListener('mousemove', move, { passive: true })
    return () => {
      window.removeEventListener('mousemove', move)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [reduced, x, y, size])

  return (
    <>
      {/* Primary glow — follows cursor closely */}
      <motion.div
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-0 hidden rounded-full md:block"
        style={{
          x: sx,
          y: sy,
          width: size,
          height: size,
          background:
            'radial-gradient(circle, rgba(43, 166, 160, 0.08), rgba(193, 126, 249, 0.05) 45%, transparent 70%)',
          willChange: 'transform',
          transform: 'translateZ(0)',
          contain: 'strict',
        }}
      />
      {/* Trailing halo — softer ambient wash */}
      <motion.div
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-0 hidden rounded-full md:block"
        style={{
          x: tx,
          y: ty,
          width: size * 1.3,
          height: size * 1.3,
          background:
            'radial-gradient(circle, rgba(193, 126, 249, 0.045), rgba(184, 217, 107, 0.03) 45%, transparent 72%)',
          willChange: 'transform',
          transform: 'translateZ(0)',
          contain: 'strict',
        }}
      />
    </>
  )
}
