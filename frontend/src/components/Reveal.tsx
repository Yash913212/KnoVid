import { motion } from 'motion/react'
import type { Variants } from 'motion/react'
import type { ReactNode } from 'react'
import { usePrefersReducedMotion } from '../lib/motion'

// Claude-style cinematic easing: fast arrival, long settle.
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]
const VIEWPORT = { once: true, margin: '0px 0px -72px 0px' } as const

// ─── Single-element scroll reveal ─────────────────────────────────
// Rises out of a soft blur and resolves sharp — the signature move for
// marketing copy, feature cards, and section intros.
export function Reveal({
  children,
  className = '',
  delay = 0,
  y = 30,
  blur = 8,
}: {
  children: ReactNode
  className?: string
  delay?: number
  y?: number
  blur?: number
}) {
  const reduced = usePrefersReducedMotion()
  if (reduced) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y, filter: `blur(${blur}px)` }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={VIEWPORT}
      transition={{ duration: 0.9, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  )
}

// ─── Staggered group ──────────────────────────────────────────────
// Parent drives a cascade of child RevealItem entries as it scrolls in.
export function RevealGroup({
  children,
  className = '',
  stagger = 0.1,
  delayChildren = 0,
  amount = 0.2,
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
      viewport={{ once: true, amount, margin: '0px 0px -64px 0px' }}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: stagger, delayChildren } },
      }}
    >
      {children}
    </motion.div>
  )
}

const fromMap: Record<'up' | 'left' | 'right' | 'none', Variants> = {
  up: {
    hidden: { opacity: 0, y: 26, filter: 'blur(6px)' },
    visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.8, ease: EASE } },
  },
  left: {
    hidden: { opacity: 0, x: -30, filter: 'blur(6px)' },
    visible: { opacity: 1, x: 0, filter: 'blur(0px)', transition: { duration: 0.8, ease: EASE } },
  },
  right: {
    hidden: { opacity: 0, x: 30, filter: 'blur(6px)' },
    visible: { opacity: 1, x: 0, filter: 'blur(0px)', transition: { duration: 0.8, ease: EASE } },
  },
  none: {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.8, ease: EASE } },
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
  from?: 'up' | 'left' | 'right' | 'none'
}) {
  const reduced = usePrefersReducedMotion()
  if (reduced) return <div className={className}>{children}</div>
  return (
    <motion.div className={className} variants={fromMap[from]}>
      {children}
    </motion.div>
  )
}

// ─── Masked headline reveal ───────────────────────────────────────
// Headline lines slide up out of overflow masks, one after another.
// Render each line with <Line> inside a <Headline>.
const lineVariants: Variants = {
  hidden: { y: '118%', rotate: 1.2 },
  visible: { y: '0%', rotate: 0, transition: { duration: 0.85, ease: EASE } },
}

export function Headline({
  children,
  as = 'h2',
  className = '',
  stagger = 0.16,
  amount = 0.5,
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
    <span className={`headline-mask ${className}`}>
      <motion.span className="headline-line" variants={lineVariants}>
        {children}
      </motion.span>
    </span>
  )
}
