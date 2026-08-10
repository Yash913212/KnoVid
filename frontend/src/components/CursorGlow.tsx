import { useEffect } from 'react'
import { motion, useMotionValue, useSpring } from 'motion/react'
import { usePrefersReducedMotion } from '../lib/motion'

// Soft tangerine→orchid light that trails the cursor across the whole app.
// Sits behind content (z-0) so it never fights with cards or text.
export default function CursorGlow() {
  const reduced = usePrefersReducedMotion()
  const size = 620
  const x = useMotionValue(-size)
  const y = useMotionValue(-size)
  const sx = useSpring(x, { stiffness: 90, damping: 22, mass: 0.7 })
  const sy = useSpring(y, { stiffness: 90, damping: 22, mass: 0.7 })

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
    <motion.div
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-0 hidden rounded-full md:block"
      style={{
        x: sx,
        y: sy,
        width: size,
        height: size,
        background:
          'radial-gradient(circle, rgb(255 107 53 / 0.06), rgb(217 70 239 / 0.045) 45%, transparent 70%)',
      }}
    />
  )
}
