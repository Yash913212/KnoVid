import { useEffect, useState } from 'react'
import type { Transition } from 'motion/react'

// ─── Duration tokens ──────────────────────────────────────────────
// Motion library uses seconds; CSS utilities use milliseconds.
export const DURATION = {
  micro: 0.15,
  content: 0.3,
  page: 0.45,
  staggerDelay: 0.07,
  graphFit: 0.4,
} as const

export const DURATION_MS = {
  micro: 150,
  content: 300,
  page: 450,
  staggerDelay: 70,
  graphFit: 400,
} as const

// ─── Easing tokens (cubic-bezier tuples for motion) ───────────────
export const EASING = {
  easeOut: [0.25, 0.1, 0.25, 1] as const,
  easeInOut: [0.4, 0, 0.2, 1] as const,
  easeIn: [0.42, 0, 1, 1] as const,
} as const

// Shared transition objects
export const transitions = {
  micro: { duration: DURATION.micro, ease: EASING.easeOut } as Transition,
  content: { duration: DURATION.content, ease: EASING.easeInOut } as Transition,
  page: { duration: DURATION.page, ease: EASING.easeInOut } as Transition,
  microIn: { duration: DURATION.micro, ease: EASING.easeOut } as Transition,
  microOut: { duration: DURATION.micro, ease: EASING.easeIn } as Transition,
  contentIn: { duration: DURATION.content, ease: EASING.easeOut } as Transition,
  contentOut: { duration: DURATION.content, ease: EASING.easeIn } as Transition,
  graphFit: { duration: DURATION.graphFit, ease: EASING.easeInOut } as Transition,
} as const

// ─── Reusable Motion variants ────────────────────────────────────
export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
}

export const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
}

// Entrance lift for stat / pipeline cards: taller rise, same snappy duration.
export const fadeUpLift = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
}

// Video library tiles: fade + settle from a slight zoom.
export const scaleFade = {
  initial: { opacity: 0, scale: 0.96, y: 10 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.97, y: 6 },
}

export const fadeDown = {
  initial: { opacity: 0, y: -12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 12 },
}

export const scaleIn = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
}

export const popIn = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.98 },
}

export const slideInRight = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 20 },
}

export const slideInLeft = {
  initial: { opacity: 0, x: -20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
}

export const graphNodeReveal = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.98 },
}

export const graphEdgeReveal = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
}

export const contentStream = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
}

// AI content "materializing": faded up + slightly blurred, resolving sharp.
export const materialize = {
  initial: { opacity: 0, y: 8, filter: 'blur(4px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, y: -6, filter: 'blur(2px)' },
}

// Chat bubbles: user from the right, assistant from the left.
export const chatBubble = (from: 'user' | 'assistant') => ({
  initial: { opacity: 0, x: from === 'user' ? 24 : -24, scale: 0.98 },
  animate: { opacity: 1, x: 0, scale: 1 },
  exit: { opacity: 0, x: from === 'user' ? 16 : -16, scale: 0.98 },
})

export interface StaggerOpts {
  delay?: number
  amount?: number
}

export const staggerContainer = (opts: StaggerOpts = {}) => ({
  initial: {},
  animate: {
    transition: {
      staggerChildren: opts.delay ?? DURATION.staggerDelay,
      delayChildren: opts.amount ?? 0,
      type: 'tween' as const,
    },
  },
  exit: {},
})

export const staggerItem = (variant = fadeUp) => ({
  initial: variant.initial,
  animate: { ...variant.animate, transition: { duration: DURATION.content, ease: EASING.easeOut } },
  exit: variant.exit,
})

export const softPulse = {
  initial: { opacity: 0.82 },
  animate: {
    opacity: [0.82, 1, 0.82],
    transition: { duration: 2.2, repeat: Infinity, ease: EASING.easeInOut },
  },
}

export const pageShell = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
}

// ─── Tailwind utility strings for simple states ─────────────────
// Micro-interactions: hover scale, press, focus rings
export const tw = {
  microHover: 'transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:scale-[1.025] active:scale-[0.985]',
  microHoverBg: 'transition-colors duration-200 ease-out hover:bg-amber-50/70 dark:hover:bg-stone-800/70',
  microFocus: 'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2',
  contentTransition: 'transition-all duration-300 ease-in-out',
  pageTransition: 'transition-all duration-450 ease-in-out',

  // Secondary surface — recedes from the primary layer.
  surface:
    'bg-white/82 backdrop-blur-xl border border-white/70 shadow-elevated dark:border-white/10 dark:bg-stone-900/70',
  // Primary surface — brighter panel that sits closest to the user.
  surfaceRaised:
    'bg-white/92 backdrop-blur-xl border border-white/85 shadow-card dark:border-white/15 dark:bg-stone-800/75',
  // Quiet / inset surface for supporting content.
  surfaceMuted:
    'bg-white/60 backdrop-blur-xl border border-white/60 dark:border-white/8 dark:bg-stone-950/55',

  // Card hover: lift 2px + border warm-up + shadow growth.
  cardHover:
    'transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-amber-300/70 hover:shadow-card-hover dark:hover:border-amber-400/40',

  // Alias kept for VideoDetail usages.
  surfaceHover: 'transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-amber-300/70 hover:shadow-card-hover dark:hover:border-amber-400/40',

  invitingCta:
    'transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-glow-amber-strong active:scale-[0.985]',

  // Gold accent used sparingly on the single primary action per screen.
  goldCta:
    'bg-amber-500 text-stone-950 shadow-glow-amber hover:bg-amber-400 disabled:bg-amber-500/60 disabled:text-stone-900/60 disabled:shadow-none',

  // Wrapper for inputs — adds a glowing gradient border on focus.
  glowWrap: 'input-glow relative',

  // Smooth focus-ring transition for inputs (borders + soft ring glow)
  input:
    'transition-all duration-200 ease-out border-stone-200 bg-white/82 placeholder:text-stone-400 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/15 focus:outline-none dark:border-stone-700 dark:bg-stone-900/80 dark:placeholder:text-stone-500 dark:text-stone-100 dark:focus:border-amber-400 dark:focus:ring-amber-400/15',
}

// ─── Hooks ──────────────────────────────────────────────────────

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return reduced
}
