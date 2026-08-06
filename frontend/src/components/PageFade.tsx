import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { pageShell, transitions } from '../lib/motion'

// Quiet route/page transition: entrance-only fade so navigation is never
// blocked by an exit animation. `MotionConfig reducedMotion="user"` (set in
// main.tsx) collapses this to instant under prefers-reduced-motion.
export default function PageFade({ children }: { children: ReactNode }) {
  return (
    <motion.div initial={pageShell.initial} animate={pageShell.animate} transition={transitions.page}>
      {children}
    </motion.div>
  )
}