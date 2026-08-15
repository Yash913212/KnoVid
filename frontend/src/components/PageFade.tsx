import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

// Cinematic route transition: fade + rise + focus-resolve. Motion is always
// enabled so every route change animates fully.
export default function PageFade({ children }: { children: ReactNode }) {
  const location = useLocation()

  return (
    <motion.div
      key={location.pathname}
      initial={{ opacity: 0, y: 16, scale: 0.995, filter: 'blur(6px)' }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}