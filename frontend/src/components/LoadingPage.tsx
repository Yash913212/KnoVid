import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { transitions } from '../lib/motion'
import { BrandTile } from './ui/BrandTile'
import { Spinner } from './ui/Spinner'

const PHASES = [
  'Waking Whisper…',
  'Warming the glow…',
  'Translating signals…',
  'Summoning knowledge…',
]

// Cinematic boot screen: brand mark on a breathing halo, cycling phase
// captions, and shimmering content bars — used as the Suspense fallback
// while routes and heavy modules load.
export default function LoadingPage() {
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setPhase((p) => (p + 1) % PHASES.length), 1400)
    return () => clearInterval(id)
  }, [])

  return (
    <div
      aria-busy="true"
      className="app-atmosphere premium-atmosphere relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6"
    >
      <div aria-hidden className="grain-overlay" />

      <div className="relative flex flex-col items-center text-center">
        {/* Breathing halo around the brand mark */}
        <div className="relative grid place-items-center">
          <motion.span
            aria-hidden
            animate={{ opacity: [0.5, 1, 0.5], scale: [0.94, 1.04, 0.94] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
            className="pointer-events-none absolute -inset-6 rounded-full bg-[radial-gradient(circle_at_center,rgb(93_111_232/0.28),transparent_68%)] blur-xl"
          />
          <motion.span
            aria-hidden
            animate={{ rotate: 360 }}
            transition={{ duration: 7, repeat: Infinity, ease: 'linear' }}
            className="pointer-events-none absolute -inset-3 rounded-full border border-dashed border-white/10 dark:border-white/15"
          />
          <motion.div
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
            className="relative"
          >
            <BrandTile size="lg" glow className="h-14 w-14 rounded-2xl">
              <IconLogo className="h-7 w-7" />
            </BrandTile>
          </motion.div>
        </div>

        <h1 className="font-display mt-6 text-2xl font-bold tracking-tight text-stone-900 dark:text-white">
          Kno<span className="font-serif italic font-normal title-gradient">Vid</span>
        </h1>

        <div className="mt-4 flex h-5 items-center gap-2">
          <Spinner className="h-3.5 w-3.5" />
          <span role="status" aria-live="polite" className="flex items-center">
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={phase}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={transitions.micro}
                className="text-xs font-medium tracking-wide text-stone-500 dark:text-stone-400"
              >
                {PHASES[phase]}
              </motion.p>
            </AnimatePresence>
          </span>
        </div>
      </div>

      {/* Content skeleton hints */}
      <div className="absolute bottom-10 w-full max-w-xs space-y-2.5 px-6 opacity-70">
        <SkeletonBar width="w-full" />
        <SkeletonBar width="w-4/5" />
        <SkeletonBar width="w-3/5" />
      </div>
    </div>
  )
}

function SkeletonBar({ width }: { width: string }) {
  return <div className={`skeleton-shimmer h-2 rounded-full ${width}`} />
}

function IconLogo({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" />
    </svg>
  )
}
