import { useState, type FormEvent, type ReactNode } from 'react'
import { AnimatePresence, motion, type Variants } from 'motion/react'
import { ArrowRight, AudioLines, BrainCircuit, Network, Sparkles } from 'lucide-react'
import ThemeToggle from './ThemeToggle'
import LogoMark from './brand/LogoMark'
import Magnetic from './Magnetic'
import { transitions } from '../lib/motion'

// Signature cinematic easing: fast arrival, long settle.
const EASE = [0.22, 1, 0.36, 1] as const

// Column choreography — brand drops in, story rises from a soft blur
// line by line, signal board fans in last.
const storyParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.1 } },
}
const storyChild: Variants = {
  hidden: { opacity: 0, y: 26, filter: 'blur(8px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.85, ease: EASE } },
}
const boardParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.15 } },
}
const boardChild: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.96 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.6, ease: EASE } },
}

export default function AuthShell({
  mode,
  eyebrow,
  title,
  subtitle,
  error,
  submitLabel,
  busy,
  onSubmit,
  footer,
  children,
}: {
  mode: 'login' | 'register'
  eyebrow: string
  title: string
  subtitle: string
  error: string
  submitLabel: string
  busy: boolean
  onSubmit: (event: FormEvent) => void
  footer: ReactNode
  children: ReactNode
}) {
  const register = mode === 'register'
  return (
    <div className={`auth-stage auth-stage-${mode}`}>
      <div className="auth-stage-noise" />
      <div className="auth-left">
        {/* Ambient mesh + grid, drifting behind the story */}
        <div aria-hidden className="auth-grid absolute inset-0 opacity-60" />
        <motion.div
          aria-hidden
          className="mesh-blob mesh-a"
          style={{ width: 460, height: 460, top: '-12%', left: '-14%' }}
        />
        <motion.div
          aria-hidden
          className="mesh-blob mesh-b"
          style={{ width: 380, height: 380, bottom: '-18%', right: '-8%' }}
        />

        <motion.div
          className="auth-brand relative"
          initial={{ opacity: 0, y: -12, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <LogoMark /><ThemeToggle />
        </motion.div>

        <motion.div
          className="auth-story relative"
          initial="hidden"
          animate="show"
          variants={storyParent}
        >
          <motion.p className="eyebrow-line" variants={storyChild}>
            <span className="live-dot" /> Personal knowledge infrastructure
          </motion.p>
          <motion.h1 variants={storyChild}>
            {register ? <>Give your attention<br /><em>a place to land.</em></> : <>Welcome back to<br /><em>the signal.</em></>}
          </motion.h1>
          <motion.p className="auth-story-copy" variants={storyChild}>
            KnoVid turns long-form video into a workspace you can search, connect, question, and remember.
          </motion.p>

          <motion.div className="auth-signal-board" variants={storyChild}>
            <motion.div className="signal-board-top" variants={boardChild}>
              <span>LIVE TRANSFORMATION</span><span>04 / 04</span>
            </motion.div>
            <motion.div className="signal-board-grid" variants={boardParent}>
              <motion.div className="auth-signal-item" variants={boardChild}><span><AudioLines size={15} /></span><strong>Transcript</strong><small>every word indexed</small></motion.div>
              <motion.div className="auth-signal-item" variants={boardChild}><span><Network size={15} /></span><strong>Graph</strong><small>ideas connected</small></motion.div>
              <motion.div className="auth-signal-item" variants={boardChild}><span><Sparkles size={15} /></span><strong>Fusion</strong><small>new meaning found</small></motion.div>
              <motion.div className="auth-signal-item" variants={boardChild}><span><BrainCircuit size={15} /></span><strong>Recall</strong><small>learning compounds</small></motion.div>
            </motion.div>
            <motion.div className="auth-mini-graph" variants={boardChild}><span /><span /><span /><span /><i /><i /><i /></motion.div>
          </motion.div>
        </motion.div>

        <motion.p
          className="auth-footnote relative"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1, duration: 0.8 }}
        >
          A quiet system for loud ideas.
        </motion.p>
      </div>

      <div className="auth-right">
        <motion.form
          className="auth-form"
          onSubmit={onSubmit}
          initial={{ opacity: 0, y: 22, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.05 }}
        >
          <motion.div
            className="auth-form-heading"
            initial="hidden"
            animate="show"
            variants={storyParent}
          >
            <motion.span className="auth-kicker" variants={storyChild}>{eyebrow}</motion.span>
            <motion.h2 variants={storyChild}>{title}</motion.h2>
            <motion.p variants={storyChild}>{subtitle}</motion.p>
          </motion.div>

          <AnimatePresence mode="wait">
            {error && (
              <motion.p
                key={error}
                role="alert"
                className="auth-error"
                initial={{ opacity: 0, x: 0 }}
                animate={{ opacity: 1, x: [0, -8, 8, -5, 5, 0] }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          <div className="auth-fields">{children}</div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...transitions.content, delay: 0.35 }}
          >
            <Magnetic strength={0.18}>
              <button type="submit" disabled={busy} className="auth-submit group">
                <span>{busy ? 'Working…' : submitLabel}</span>
                <ArrowRight size={16} className="transition-transform duration-300 ease-out group-hover:translate-x-1" />
              </button>
            </Magnetic>
          </motion.div>

          <motion.p
            className="auth-footer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ ...transitions.content, delay: 0.45 }}
          >
            {footer}
          </motion.p>
        </motion.form>
      </div>
    </div>
  )
}

export function AuthField({ label, type, value, onChange, placeholder, autoComplete }: { label: string; type: string; value: string; onChange: (value: string) => void; placeholder?: string; autoComplete?: string }) {
  const [focused, setFocused] = useState(false)
  return (
    <label className="auth-field">
      <span>{label}</span>
      <span className="auth-field-input">
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(event) => onChange(event.target.value)}
        />
        <motion.span
          aria-hidden
          className="auth-field-underline"
          initial={false}
          animate={{ scaleX: focused ? 1 : 0, opacity: focused ? 1 : 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        />
      </span>
    </label>
  )
}
