import { motion } from 'motion/react'

const STARS = [
  { top: '22%', left: '12%', delay: 0, size: 2 },
  { top: '68%', left: '22%', delay: 1.2, size: 1.5 },
  { top: '34%', left: '58%', delay: 2.1, size: 2.5 },
  { top: '82%', left: '68%', delay: 0.6, size: 1.5 },
  { top: '18%', left: '84%', delay: 1.7, size: 2 },
  { top: '54%', left: '38%', delay: 3, size: 1.5 },
]

export default function AuroraBackground() {
  return (
    <div aria-hidden className="ambient-background">
      <div className="ambient-noise" />
      <div className="ambient-grid" />
      <motion.div className="ambient-orb ambient-orb-lime" animate={{ x: [0, 80, -30, 0], y: [0, 40, 100, 0] }} transition={{ duration: 30, repeat: Infinity, ease: 'easeInOut' }} />
      <motion.div className="ambient-orb ambient-orb-orchid" animate={{ x: [0, -80, 45, 0], y: [0, 90, 20, 0] }} transition={{ duration: 36, repeat: Infinity, ease: 'easeInOut' }} />
      <motion.div className="ambient-orb ambient-orb-coral" animate={{ x: [0, 60, -70, 0], y: [0, -55, 20, 0] }} transition={{ duration: 42, repeat: Infinity, ease: 'easeInOut' }} />
      <motion.div className="ambient-orb ambient-orb-amber" animate={{ x: [0, -60, 40, 0], y: [0, 30, -50, 0] }} transition={{ duration: 48, repeat: Infinity, ease: 'easeInOut' }} />
      {STARS.map((s, i) => (
        <motion.span
          key={i}
          className="ambient-star"
          style={{ top: s.top, left: s.left, width: s.size, height: s.size }}
          animate={{ opacity: [0.15, 0.75, 0.15], scale: [0.8, 1.15, 0.8] }}
          transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut', delay: s.delay }}
        />
      ))}
    </div>
  )
}
