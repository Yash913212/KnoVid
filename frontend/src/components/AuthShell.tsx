import type { FormEvent, ReactNode } from 'react'
import { motion } from 'motion/react'
import { ArrowRight, AudioLines, BrainCircuit, Network, Sparkles } from 'lucide-react'
import ThemeToggle from './ThemeToggle'
import LogoMark from './brand/LogoMark'

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
        <div className="auth-brand"><LogoMark /><ThemeToggle /></div>
        <div className="auth-story">
          <p className="eyebrow-line"><span className="live-dot" /> Personal knowledge infrastructure</p>
          <h1>{register ? <>Give your attention<br /><em>a place to land.</em></> : <>Welcome back to<br /><em>the signal.</em></>}</h1>
          <p className="auth-story-copy">KnoVid turns long-form video into a workspace you can search, connect, question, and remember.</p>
          <div className="auth-signal-board">
            <div className="signal-board-top"><span>LIVE TRANSFORMATION</span><span>04 / 04</span></div>
            <div className="signal-board-grid">
              <div className="auth-signal-item"><span><AudioLines size={15} /></span><strong>Transcript</strong><small>every word indexed</small></div>
              <div className="auth-signal-item"><span><Network size={15} /></span><strong>Graph</strong><small>ideas connected</small></div>
              <div className="auth-signal-item"><span><Sparkles size={15} /></span><strong>Fusion</strong><small>new meaning found</small></div>
              <div className="auth-signal-item"><span><BrainCircuit size={15} /></span><strong>Recall</strong><small>learning compounds</small></div>
            </div>
            <div className="auth-mini-graph"><span /><span /><span /><span /><i /><i /><i /></div>
          </div>
        </div>
        <p className="auth-footnote">A quiet system for loud ideas.</p>
      </div>
      <div className="auth-right">
        <motion.form className="auth-form" onSubmit={onSubmit} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
          <div className="auth-form-heading"><span className="auth-kicker">{eyebrow}</span><h2>{title}</h2><p>{subtitle}</p></div>
          {error && <p role="alert" className="auth-error">{error}</p>}
          <div className="auth-fields">{children}</div>
          <button type="submit" disabled={busy} className="auth-submit">{busy ? 'Working…' : submitLabel}<ArrowRight size={16} /></button>
          <p className="auth-footer">{footer}</p>
        </motion.form>
      </div>
    </div>
  )
}

export function AuthField({ label, type, value, onChange, placeholder, autoComplete }: { label: string; type: string; value: string; onChange: (value: string) => void; placeholder?: string; autoComplete?: string }) {
  return <label className="auth-field"><span>{label}</span><input type={type} value={value} placeholder={placeholder} autoComplete={autoComplete} required onChange={(event) => onChange(event.target.value)} /></label>
}
