import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import {
  ArrowDownRight,
  ArrowRight,
  AudioLines,
  BrainCircuit,
  Check,
  CirclePlay,
  Menu,
  Network,
  Sparkles,
  X,
} from 'lucide-react'
import SeoHead from '../components/SeoHead'
import LogoMark, { BrandTag } from '../components/brand/LogoMark'
import FeatureCard from '../components/marketing/FeatureCard'
import { Button } from '../components/ui/Button'
import ThemeToggle from '../components/ThemeToggle'
import { Headline, Line, Reveal, RevealGroup, RevealItem } from '../components/Reveal'

const NAV_LINKS = [
  { href: '#capabilities', label: 'Capabilities' },
  { href: '#workflow', label: 'Workflow' },
  { href: '#for-thinkers', label: 'For thinkers' },
]

const featureCards = [
  {
    index: '01',
    icon: <AudioLines size={19} />,
    eyebrow: 'Time-aware transcript',
    title: 'Every word stays attached to the moment.',
    description: 'Search, jump, and replay the exact sentence that matters — with speakers, timestamps, and language preserved.',
    accent: 'lime' as const,
  },
  {
    index: '02',
    icon: <Network size={19} />,
    eyebrow: 'Knowledge graph',
    title: 'See the ideas behind the video.',
    description: 'Entities, keywords, and topics become a navigable map instead of a flat wall of text.',
    accent: 'orchid' as const,
  },
  {
    index: '03',
    icon: <Sparkles size={19} />,
    eyebrow: 'Node Fusion',
    title: 'Ask what two ideas have in common.',
    description: 'Drag concepts together and get an AI-synthesized connection grounded in source moments you can verify.',
    accent: 'coral' as const,
  },
  {
    index: '04',
    icon: <BrainCircuit size={19} />,
    eyebrow: 'Recall loop',
    title: 'Turn watching into remembering.',
    description: 'Generate notes, quizzes, summaries, and questions that pull you back to the source when it counts.',
    accent: 'violet' as const,
  },
]

const CINEMATIC: [number, number, number, number] = [0.22, 1, 0.36, 1]

export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <>
      <SeoHead
        title="KnoVid — Watch less. Remember more."
        description="Turn any lecture, interview, or research video into a searchable transcript, living knowledge graph, and grounded study workspace."
      />
      <div className="marketing-page">
        <header className="marketing-nav">
          <div className="marketing-nav-inner">
            <Link to="/" aria-label="KnoVid home"><LogoMark /></Link>
            <div className="marketing-links">
              {NAV_LINKS.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}
            </div>
            <div className="marketing-actions">
              <ThemeToggle />
              <Link className="nav-signin" to="/login">Sign in</Link>
              <Link to="/register"><Button size="sm" radius="xl">Start for free <ArrowRight size={14} /></Button></Link>
            </div>
            <div className="marketing-actions-mobile">
              <ThemeToggle />
            </div>
            <button
              type="button"
              className="mobile-nav-toggle"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X size={19} /> : <Menu size={19} />}
            </button>
          </div>
          {menuOpen && (
            <div className="mobile-nav-panel">
              {NAV_LINKS.map((link) => <a key={link.href} href={link.href} onClick={() => setMenuOpen(false)}>{link.label}</a>)}
              <Link to="/login" onClick={() => setMenuOpen(false)}>Sign in</Link>
              <Link to="/register" onClick={() => setMenuOpen(false)}><Button className="w-full" radius="xl">Start for free</Button></Link>
            </div>
          )}
        </header>

        <main>
          <section className="hero-section">
            <div className="hero-copy">
              <Reveal delay={0.05} y={18} blur={4}>
                <div className="hero-kicker-row">
                  <div className="eyebrow-line"><span className="live-dot" /> Video intelligence for curious people</div>
                  <span className="hero-timecode">REC&nbsp;&nbsp;00:42:18:12</span>
                </div>
              </Reveal>
              <Headline as="h1" stagger={0.16}>
                <Line>Watch less.</Line>
                <Line><em>Remember more.</em></Line>
              </Headline>
              <Reveal delay={0.45}>
                <p className="hero-lede">KnoVid turns everything you watch into a living workspace — searchable words, visible connections, and answers that point back to the source.</p>
              </Reveal>
              <Reveal delay={0.6}>
                <div className="hero-actions">
                  <Link to="/register"><Button size="lg" radius="xl" icon={<Sparkles size={16} />}>Build your first universe</Button></Link>
                  <a className="text-action" href="#capabilities"><CirclePlay size={16} /> See how it works</a>
                </div>
              </Reveal>
              <Reveal delay={0.78}>
                <div className="hero-proof">
                  <div className="avatar-stack" aria-hidden="true"><span>AL</span><span>RS</span><span>MK</span><span>+</span></div>
                  <p><strong>Built for deep work</strong><br />Lectures · interviews · research · podcasts</p>
                </div>
              </Reveal>
              <div className="hero-scene-rule" aria-hidden="true">
                <span>KNOVID / MEMORY REEL</span>
                <i />
                <span>SCENE 01</span>
              </div>
            </div>
            <motion.div
              className="hero-visual"
              aria-label="KnoVid workspace preview"
              initial={{ opacity: 0, scale: 0.97, y: 28 }}
              whileInView={{ opacity: 1, scale: 1, y: 0 }}
              viewport={{ once: true, margin: '0px 0px -40px 0px' }}
              transition={{ duration: 1, ease: CINEMATIC, delay: 0.5 }}
            >
              <div className="hero-visual-glow" />
              <div className="hero-projection-frame" aria-hidden="true"><span /><span /><span /><span /></div>
              <motion.div
                className="hero-float"
                animate={{ y: [0, -12, 0] }}
                transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
              >
                <div className="orbit-panel">
                  <div className="orbit-panel-header"><span className="window-dots"><i /><i /><i /></span><span>UNIVERSE / 0042</span><span className="header-status"><span className="live-dot" /> LIVE MAP</span></div>
                  <div className="orbit-panel-body">
                    <div className="preview-video-card">
                      <div className="preview-video-art"><div className="preview-play"><CirclePlay size={25} /></div><div className="video-scanline" /></div>
                      <div className="preview-video-meta"><span>THE FUTURE OF LEARNING</span><strong>42:18</strong></div>
                      <div className="preview-progress"><span /></div>
                    </div>
                    <div className="preview-map-card">
                      <div className="map-label"><span>KNOWLEDGE FIELD</span><span>26 NODES</span></div>
                      <svg viewBox="0 0 340 220" role="img" aria-label="Knowledge graph preview">
                        <defs><linearGradient id="hero-line" x1="0" x2="1"><stop stopColor="#B8D96B" /><stop offset="1" stopColor="#B06AE0" /></linearGradient><filter id="hero-glow"><feGaussianBlur stdDeviation="4" /></filter></defs>
                        <g className="graph-lines" stroke="url(#hero-line)" strokeWidth="1.3" opacity=".65"><path d="M52 139 105 61 184 117 260 52 305 152 184 117 92 184 52 139 305 152" /><path d="M105 61 92 184" /><path d="M184 117 260 52" /></g>
                        <g className="graph-halos" fill="#B8D96B" filter="url(#hero-glow)" opacity=".8"><circle cx="52" cy="139" r="7" /><circle cx="184" cy="117" r="9" /><circle cx="305" cy="152" r="7" /></g>
                        <g className="graph-nodes"><circle cx="52" cy="139" r="4" /><circle cx="105" cy="61" r="3" /><circle cx="184" cy="117" r="6" /><circle cx="260" cy="52" r="4" /><circle cx="305" cy="152" r="5" /><circle cx="92" cy="184" r="3" /></g>
                        <g className="graph-labels"><text x="36" y="158">MEMORY</text><text x="164" y="139">LEARNING</text><text x="278" y="174">SYSTEMS</text></g>
                      </svg>
                      <div className="map-footer"><span><i className="legend-lime" /> high signal</span><span><i className="legend-orchid" /> connected</span></div>
                    </div>
                    <div className="preview-insight-card"><span className="insight-icon"><Sparkles size={14} /></span><div><small>NEW CONNECTION</small><strong>Memory ↔ Learning</strong><p>Grounded in 4 source moments</p></div><ArrowDownRight size={15} /></div>
                  </div>
                </div>
                <div className="floating-stat stat-one"><span>01</span><strong>Searchable</strong><small>every sentence</small></div>
                <div className="floating-stat stat-two"><span>02</span><strong>Grounded</strong><small>every answer</small></div>
                <div className="hero-reel-caption"><span>PLAYBACK / ACTIVE</span><i /><span>42 MINUTES OF SIGNAL</span></div>
              </motion.div>
            </motion.div>
          </section>

          <section id="capabilities" className="capabilities-section content-section">
            <div className="section-intro">
              <div>
                <Reveal y={16} blur={4}><BrandTag>What the system sees</BrandTag></Reveal>
                <Headline as="h2" stagger={0.16}>
                  <Line>One video.</Line>
                  <Line><em>Four ways in.</em></Line>
                </Headline>
              </div>
              <Reveal delay={0.18} y={18} blur={4}><p>Most tools stop at transcription. KnoVid gives your attention somewhere to go next.</p></Reveal>
            </div>
            <RevealGroup className="feature-grid" stagger={0.12} amount={0.2}>
              {featureCards.map((card) => <RevealItem key={card.index}><FeatureCard {...card} /></RevealItem>)}
            </RevealGroup>
          </section>

          <section id="workflow" className="workflow-section content-section">
            <div className="workflow-header">
              <div>
                <Reveal y={16} blur={4}><BrandTag>The KnoVid loop</BrandTag></Reveal>
                <Headline as="h2" stagger={0.16}>
                  <Line>From signal</Line>
                  <Line><em>to insight.</em></Line>
                </Headline>
              </div>
              <Reveal delay={0.18} y={18} blur={4}><p>Your video moves through a quiet, deliberate pipeline that leaves the source visible at every step.</p></Reveal>
            </div>
            <RevealGroup className="workflow-rail" stagger={0.15} amount={0.25}>
              {[['01', 'Ingest', 'Upload a file or paste a link.'], ['02', 'Understand', 'Transcribe, diarize, and find signal.'], ['03', 'Connect', 'Map the ideas that travel together.'], ['04', 'Recall', 'Ask, study, and return to the moment.']].map(([number, title, desc], i) => (
                <RevealItem className="workflow-step" key={number}><span className="workflow-number">{number}</span><div className={`workflow-symbol workflow-symbol-${i}`}><span /></div><h3>{title}</h3><p>{desc}</p>{i < 3 && <ArrowRight className="workflow-arrow" size={16} />}</RevealItem>
              ))}
            </RevealGroup>
          </section>

          <section id="for-thinkers" className="thinkers-section content-section">
            <Reveal y={26} blur={6}>
              <div className="thinkers-panel">
                <div className="thinkers-copy">
                  <BrandTag>Made for the way you think</BrandTag>
                  <Headline as="h2" stagger={0.16}>
                    <Line>Your second brain</Line>
                    <Line><em>should have timestamps.</em></Line>
                  </Headline>
                  <p>Whether you are studying a lecture, researching a field, or making sense of a long interview, KnoVid keeps context close and gives curiosity a structure.</p>
                  <Link to="/register"><Button variant="secondary" size="lg" radius="xl">Enter the workspace <ArrowRight size={16} /></Button></Link>
                </div>
                <RevealGroup className="thinkers-list" stagger={0.1} delayChildren={0.25} amount={0.4}>
                  {['Search the exact moment', 'See speakers and themes separate', 'Fuse ideas with source evidence', 'Export what you learned'].map((item) => (
                    <RevealItem className="check-row" from="left" key={item}><span><Check size={13} /></span>{item}</RevealItem>
                  ))}
                </RevealGroup>
              </div>
            </Reveal>
          </section>

          <section className="closing-section">
            <div className="closing-orb" />
            <Reveal y={16} blur={4}><BrandTag>Your next hour is already in here</BrandTag></Reveal>
            <Headline as="h2" stagger={0.16}>
              <Line>Make watching</Line>
              <Line><em>compound.</em></Line>
            </Headline>
            <Reveal delay={0.2} y={18} blur={4}><p>Start with one video. Leave with a universe.</p></Reveal>
            <Reveal delay={0.3} y={18} blur={4}><Link to="/register"><Button size="lg" radius="xl">Start building <ArrowRight size={16} /></Button></Link></Reveal>
          </section>
        </main>

        <footer className="marketing-footer"><Link to="/"><LogoMark /></Link><span>Video to knowledge, with a memory.</span><div><Link to="/login">Sign in</Link><Link to="/register">Create workspace</Link></div></footer>
      </div>
    </>
  )
}
