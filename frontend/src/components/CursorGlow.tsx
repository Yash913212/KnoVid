import { useEffect } from 'react'
import { motion, useMotionValue, useSpring } from 'motion/react'
import { usePrefersReducedMotion } from '../lib/motion'

// Soft tangerine→orchid light that trails the cursor across the whole app.
// A laggy secondary halo follows behind for that layered "heat shimmer" feel.
// Sits behind content (z-0) so it never fights with cards or text.
export default function CursorGlow() {
  const reduced = usePrefersReducedMotion()
  const size = 620
  const x = useMotionValue(-size)
  const y = useMotionValue(-size)
  const sx = useSpring(x, { stiffness: 90, damping: 22, mass: 0.7 })
  const sy = useSpring(y, { stiffness: 90, damping: 22, mass: 0.7 })
  const tx = useSpring(x, { stiffness: 42, damping: 24, mass: 1.2 })
  const ty = useSpring(y, { stiffness: 42, damping: 24, mass: 1.2 })

  useEffect(() => {
    if (reduced) return
    const move = (e: MouseEvent) => {
      x.set(e.clientX - size / 2)
      y.set(e.clientY - size / 2)
    }
    window.addEventListener('mousemove', move)
    return () => window.removeEventListener('mousemove', move)
  }, [reduced, x, y])

  return (
    <>
      {/* Leading glow — follows the cursor closely */}
      <motion.div
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-0 hidden rounded-full mix-blend-screen md:block"
        style={{
          x: sx,
          y: sy,
          width: size,
          height: size,
          background:
            'radial-gradient(circle, rgb(43 166 160 / 0.07), rgb(193 126 249 / 0.05) 45%, transparent 70%)',
        }}
      />
      {/* Trailing halo — lags behind, cooling as it catches up */}
      <motion.div
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-0 hidden rounded-full mix-blend-screen md:block"
        style={{
          x: tx,
          y: ty,
          width: size * 1.35,
          height: size * 1.35,
          background:
            'radial-gradient(circle, rgb(193 126 249 / 0.045), rgb(184 217 107 / 0.03) 45%, transparent 72%)',
        }}
      />
    </>
  )
}
