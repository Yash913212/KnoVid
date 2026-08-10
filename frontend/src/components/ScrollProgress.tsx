import { motion, useScroll, useSpring } from 'motion/react'

// Hairline brand-gradient progress bar pinned to the top of the viewport.
export default function ScrollProgress() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 160, damping: 30, restDelta: 0.001 })

  return (
    <motion.div
      aria-hidden
      className="fixed inset-x-0 top-0 z-[70] h-[3px] origin-left bg-gradient-to-r from-[#FF6B35] via-[#FF9A3D] to-[#D946EF] shadow-[0_0_16px_rgb(217_70_239/0.55)]"
      style={{ scaleX }}
    />
  )
}
