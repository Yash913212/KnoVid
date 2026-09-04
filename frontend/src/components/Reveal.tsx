import { motion } from 'motion/react'
import type { Variants } from 'motion/react'
import type { ReactNode } from 'react'
import { usePrefersReducedMotion } from '../lib/motion'

// Luxury ease curve: rapid initial velocity, silky smooth settle (composite-only on GPU)
const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]
const VIEWPORT = { once: true, margin: '0px 0px -40px 0px' } as const

// ─── Single-element scroll reveal ─────────────────────────────────
// Butter-smooth GPU-accelerated entrance with transform & opacity
export function Reveal({
  children,
  className = '',
  delay = 0,
  y = 24,
  scale = 0.98,
}: {
  children: ReactNode
  className?: string
  delay?: number
  y?: number
  scale?: number
  blur?: number // Kept for backwards compatibility
}) {
  const reduced = usePrefersReducedMotion()
  if (reduced) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y, scale }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={VIEWPORT}
      transition={{ duration: 0.75, ease: EASE, delay }}
      style={{ willChange: 'transform, opacity' }}
    >
      {children}
    </motion.div>
  )
}

// ─── Staggered group ──────────────────────────────────────────────
export function RevealGroup({
  children,
  className = '',
  stagger = 0.08,
  delayChildren = 0,
  amount = 0.15,
}: {
  children: ReactNode
  className?: string
  stagger?: number
  delayChildren?: number
  amount?: number
}) {
  const reduced = usePrefersReducedMotion()
  if (reduced) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount, margin: '0px 0px -40px 0px' }}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: stagger, delayChildren } },
      }}
    >
      {children}
    </motion.div>
  )
}

const fromMap: Record<'up' | 'left' | 'right' | 'scale' | 'none', Variants> = {
  up: {
    hidden: { opacity: 0, y: 24, scale: 0.98 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { duration: 0.7, ease: EASE },
    },
  },
  left: {
    hidden: { opacity: 0, x: -24, scale: 0.98 },
    visible: {
      opacity: 1,
      x: 0,
      scale: 1,
      transition: { duration: 0.7, ease: EASE },
    },
  },
  right: {
    hidden: { opacity: 0, x: 24, scale: 0.98 },
    visible: {
      opacity: 1,
      x: 0,
      scale: 1,
      transition: { duration: 0.7, ease: EASE },
    },
  },
  scale: {
    hidden: { opacity: 0, scale: 0.94 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: { duration: 0.7, ease: EASE },
    },
  },
  none: {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.6, ease: EASE } },
  },
}

// ─── Staggered child ──────────────────────────────────────────────
export function RevealItem({
  children,
  className = '',
  from = 'up',
}: {
  children: ReactNode
  className?: string
  from?: 'up' | 'left' | 'right' | 'scale' | 'none'
}) {
  const reduced = usePrefersReducedMotion()
  if (reduced) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      variants={fromMap[from]}
      style={{ willChange: 'transform, opacity' }}
    >
      {children}
    </motion.div>
  )
}

// ─── Masked headline reveal ───────────────────────────────────────
const lineVariants: Variants = {
  hidden: { y: '110%', opacity: 0 },
  visible: {
    y: '0%',
    opacity: 1,
    transition: { duration: 0.75, ease: EASE },
  },
}

export function Headline({
  children,
  as = 'h2',
  className = '',
  stagger = 0.12,
  amount = 0.3,
}: {
  children: ReactNode
  as?: 'h1' | 'h2' | 'h3' | 'div'
  className?: string
  stagger?: number
  amount?: number
}) {
  const reduced = usePrefersReducedMotion()
  if (reduced) {
    const PlainTag = as
    return <PlainTag className={className}>{children}</PlainTag>
  }
  const Tag = as === 'h1' ? motion.h1 : as === 'h3' ? motion.h3 : as === 'div' ? motion.div : motion.h2
  return (
    <Tag
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount }}
      variants={{ hidden: {}, visible: { transition: { staggerChildren: stagger } } }}
    >
      {children}
    </Tag>
  )
}

export function Line({ children, className = '' }: { children: ReactNode; className?: string }) {
  const reduced = usePrefersReducedMotion()
  if (reduced) return <span className={className}>{children}</span>
  return (
    <span className={`headline-mask ${className}`} style={{ display: 'inline-block', overflow: 'hidden' }}>
      <motion.span
        className="headline-line"
        variants={lineVariants}
        style={{ display: 'inline-block', willChange: 'transform, opacity' }}
      >
        {children}
      </motion.span>
    </span>
  )
}
