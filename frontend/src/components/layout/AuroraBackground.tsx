import { motion } from 'motion/react'

export default function AuroraBackground() {
  return (
    <div aria-hidden className="ambient-background">
      <div className="ambient-noise" />
      <div className="ambient-grid" />
      <motion.div className="ambient-orb ambient-orb-lime" animate={{ x: [0, 80, -30, 0], y: [0, 40, 100, 0] }} transition={{ duration: 30, repeat: Infinity, ease: 'easeInOut' }} />
      <motion.div className="ambient-orb ambient-orb-blue" animate={{ x: [0, -80, 45, 0], y: [0, 90, 20, 0] }} transition={{ duration: 36, repeat: Infinity, ease: 'easeInOut' }} />
      <motion.div className="ambient-orb ambient-orb-coral" animate={{ x: [0, 60, -70, 0], y: [0, -55, 20, 0] }} transition={{ duration: 42, repeat: Infinity, ease: 'easeInOut' }} />
    </div>
  )
}
