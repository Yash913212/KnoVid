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
    <div aria-hidden className="ambient-background" style={{ contain: 'strict' }}>
      <div className="ambient-noise" />
      <div className="ambient-grid" />
      <motion.div
        className="ambient-orb ambient-orb-lime"
        style={{ willChange: 'transform', transform: 'translateZ(0)' }}
        animate={{ x: [0, 60, -25, 0], y: [0, 30, 80, 0] }}
        transition={{ duration: 32, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="ambient-orb ambient-orb-orchid"
        style={{ willChange: 'transform', transform: 'translateZ(0)' }}
        animate={{ x: [0, -60, 35, 0], y: [0, 70, 15, 0] }}
        transition={{ duration: 38, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="ambient-orb ambient-orb-coral"
        style={{ willChange: 'transform', transform: 'translateZ(0)' }}
        animate={{ x: [0, 50, -50, 0], y: [0, -45, 15, 0] }}
        transition={{ duration: 44, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="ambient-orb ambient-orb-amber"
        style={{ willChange: 'transform', transform: 'translateZ(0)' }}
        animate={{ x: [0, -45, 30, 0], y: [0, 25, -40, 0] }}
        transition={{ duration: 50, repeat: Infinity, ease: 'easeInOut' }}
      />
      {STARS.map((s, i) => (
        <motion.span
          key={i}
          className="ambient-star"
          style={{ top: s.top, left: s.left, width: s.size, height: s.size, willChange: 'opacity, transform' }}
          animate={{ opacity: [0.2, 0.8, 0.2], scale: [0.85, 1.15, 0.85] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: s.delay }}
        />
      ))}
    </div>
  )
}
