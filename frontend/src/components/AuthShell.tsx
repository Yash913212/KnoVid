import type { FormEvent, ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { pageShell, transitions } from '../lib/motion'
import ThemeToggle from './ThemeToggle'

const CANVAS_HEADLINE = 'Unlock the knowledge trapped in your videos.'
const CANVAS_SUB =
  'KnoVid transcribes, maps speakers, and builds an interactive knowledge graph from your lectures and meetings. Stop scrubbing timelines — start querying your content.'

interface AuthShellProps {
  mode: 'login' | 'register'
  eyebrow: string
  title: string
  subtitle: string
  error: string
  submitLabel: string
  busy?: boolean
  onSubmit: (e: FormEvent) => void
  children: ReactNode
  footer: ReactNode
}

export default function AuthShell({
  eyebrow,
  title,
  subtitle,
  error,
  submitLabel,
  busy = false,
  onSubmit,
  children,
  footer,
}: AuthShellProps) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden lg:grid lg:grid-cols-[3fr_2fr]">
      {/* ── Brand canvas (60%) ─────────────────────────────────────── */}
      <aside className="relative hidden overflow-hidden lg:block" aria-hidden="true">
        <div className="absolute inset-0">
          <div className="mesh-ember absolute inset-0" />
          <div className="mesh-blob mesh-a left-[8%] top-[4%] h-110 w-110" />
          <div className="mesh-blob mesh-b right-[2%] top-[36%] h-100 w-100" />
          <div className="mesh-blob mesh-c bottom-[2%] left-[18%] h-95 w-95" />
          <div className="auth-grid absolute inset-0" />
        </div>

        <div className="relative z-10 flex min-h-screen flex-col justify-between p-12">
          <BrandRow />

          <div className="max-w-lg">
            <motion.h2
              className="font-display text-5xl font-black leading-[1.08] tracking-tight bg-gradient-to-r from-[#FF6B35] to-[#D946EF] bg-clip-text text-transparent"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...transitions.content, delay: 0.1 }}
            >
              {CANVAS_HEADLINE.split('your videos.').map((seg, i, arr) => (
                <span key={i}>
                  {seg}
                  {i < arr.length - 1 ? (
                    <span className="bg-gradient-to-r from-[#FF6B35] to-[#D946EF] bg-clip-text text-transparent">{'your videos.'}</span>
                  ) : null}
                </span>
              ))}
            </motion.h2>
            <motion.p
              className="mt-5 max-w-md text-[15px] leading-relaxed text-stone-500 dark:text-[#737373]"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...transitions.content, delay: 0.2 }}
            >
              {CANVAS_SUB}
            </motion.p>

            <motion.div
              className="mt-10"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...transitions.content, delay: 0.3 }}
            >
              <CanvasConstellation />
            </motion.div>
          </div>

          <motion.div
            className="flex gap-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ ...transitions.content, delay: 0.45 }}
          >
            <GlassStat value="19.2s" label="ingest" />
            <GlassStat value="26 nodes" label="knowledge graph" />
            <GlassStat value="qwen3:8b" label="inference" />
          </motion.div>
        </div>
      </aside>

      {/* ── Form panel (40%) ───────────────────────────────────────── */}
      <main className="relative flex items-center justify-center px-6 py-14 sm:px-10">
        <div className="absolute right-5 top-5">
          <ThemeToggle />
        </div>

        <motion.form
          onSubmit={onSubmit}
          className="w-full max-w-sm rounded-4xl border border-white/10 bg-black/40 p-8 shadow-2xl backdrop-blur-xl"
          initial={pageShell.initial}
          animate={pageShell.animate}
          transition={transitions.contentIn}
        >
          <div className="mb-9 lg:hidden">
            <BrandRow />
          </div>

          <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-[#EA580C] dark:text-[#FF8A5C]">
            {eyebrow}
          </p>
          <h1 className="font-display mt-2 text-4xl font-black tracking-tight text-stone-900 dark:text-white">
            {title}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-stone-500 dark:text-[#737373]">{subtitle}</p>

          <AnimatePresence mode="wait">
            {error && (
              <motion.p
                key={error}
                role="alert"
                className="mt-5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200 shadow-[0_0_15px_-5px_rgba(239,68,68,0.3)] line-clamp-2"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={transitions.micro}
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          <div className="mt-8 space-y-5">{children}</div>

          <motion.button
            type="submit"
            disabled={busy}
            className="btn-ember mt-8 w-full rounded-xl px-4 py-3 text-sm font-semibold text-white"
            whileTap={{ scale: busy ? 1 : 0.98 }}
          >
            {busy ? (
              <span className="inline-flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
                  <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
                Working…
              </span>
            ) : (
              submitLabel
            )}
          </motion.button>

          <div className="my-5 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-widest text-stone-400 dark:text-stone-500">
            <span className="h-px flex-1 bg-black/10 dark:bg-white/10" />
            or
            <span className="h-px flex-1 bg-black/10 dark:bg-white/10" />
          </div>

          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-black/15 bg-white px-4 py-3 text-sm font-medium text-stone-700 transition-colors duration-200 hover:border-accent/60 hover:text-stone-900 dark:border-white/15 dark:bg-white/3 dark:text-stone-300 dark:hover:border-accent-2/60 dark:hover:text-white"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.387.6.113.82-.26.82-.577 0-.285-.01-1.04-.015-2.04-3.338.726-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.73.083-.73 1.205.085 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.305.762-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.468-2.38 1.235-3.22-.123-.303-.535-1.523.117-3.176 0 0 1.008-.322 3.3 1.23a11.5 11.5 0 0 1 3.003-.404c1.02.005 2.045.138 3.003.404 2.29-1.552 3.297-1.23 3.297-1.23.653 1.653.24 2.873.118 3.176.77.84 1.233 1.91 1.233 3.22 0 4.61-2.805 5.625-5.475 5.92.43.37.812 1.102.812 2.222 0 1.606-.015 2.898-.015 3.293 0 .32.216.694.825.576C20.565 21.797 24 17.3 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
            Continue with GitHub
          </button>

          <p className="mt-6 text-center text-sm text-stone-500 dark:text-stone-400">{footer}</p>
        </motion.form>
      </main>
    </div>
  )
}

export function AuthField({
  label,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  label: string
  type: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoComplete?: string
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-stone-500 dark:text-[#737373]">
        {label}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
        onChange={(e) => onChange(e.target.value)}
        className="input-ember w-full border-b border-white/20 bg-transparent px-0.5 pb-2.5 pt-1 text-sm text-stone-100 outline-none placeholder:text-stone-400 focus:border-accent focus:shadow-[0_2px_10px_-3px_rgba(255,107,53,0.5)] dark:text-white dark:placeholder:text-stone-500"
      />
    </label>
  )
}

function BrandRow() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-linear-to-br from-accent to-accent-2 text-white shadow-[0_0_24px_rgb(217_70_239/0.45)]">
        <IconLogo className="h-5 w-5" />
      </span>
      <span className="font-display text-lg font-black tracking-tight text-stone-900 dark:text-white">KnoVid</span>
    </div>
  )
}

function GlassStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/40 px-4 py-3 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.3)]">
      <p className="font-mono text-sm font-bold text-[#FF8A5C]">{value}</p>
      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-widest text-stone-500 dark:text-[#737373]">{label}</p>
    </div>
  )
}

function CanvasConstellation() {
  const nodes = [
    { x: 60, y: 150, r: 5, fill: '#FF6B35' },
    { x: 150, y: 90, r: 4, fill: '#D946EF' },
    { x: 240, y: 140, r: 6, fill: '#FF9A3D' },
    { x: 330, y: 70, r: 4, fill: '#E879F9' },
    { x: 420, y: 120, r: 5, fill: '#FF6B35' },
    { x: 470, y: 60, r: 4, fill: '#D946EF' },
    { x: 120, y: 40, r: 4, fill: '#E879F9' },
    { x: 380, y: 165, r: 4, fill: '#FF9A3D' },
  ]
  return (
    <svg viewBox="0 0 520 200" className="w-full max-w-lg overflow-visible" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path className="auth-path" d="M60 150 C 130 40 200 190 240 140 S 340 60 420 120 S 460 60 470 60" strokeWidth="1.6" opacity="0.55" />
      <path className="auth-path" d="M120 40 C 160 110 210 170 240 140 S 350 160 380 165" strokeWidth="1.6" opacity="0.45" strokeDasharray="2 7" />
      {nodes.map((n, i) => (
        <motion.circle
          key={`${n.x}-${n.y}`}
          cx={n.x}
          cy={n.y}
          r={n.r}
          fill={n.fill}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [1, 1.22, 1], opacity: 1 }}
          transition={{ delay: 0.35 + i * 0.06, duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </svg>
  )
}

function IconLogo({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" />
    </svg>
  )
}
