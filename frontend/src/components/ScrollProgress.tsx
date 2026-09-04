import { motion, useScroll, useSpring } from 'motion/react'

// Hairline brand-gradient progress bar pinned to the top of the viewport.
export default function ScrollProgress() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 160, damping: 30, restDelta: 0.001 })

  return (
    <motion.div
      aria-hidden
      className="fixed inset-x-0 top-0 z-[70] h-[3px] origin-left bg-gradient-to-r from-[#B8D96B] via-[#B06AE0] to-[#D08A68] shadow-[0_0_16px_rgb(184_217_107/0.55)]"
      style={{ scaleX, willChange: 'transform', transform: 'translateZ(0)' }}
    />
  )
}
