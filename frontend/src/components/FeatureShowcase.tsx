import { useState, useEffect, Fragment } from 'react'
import { motion } from 'motion/react'
import { staggerContainer, staggerItem, fadeUpLift, transitions } from '../lib/motion'

// ─── Mock data: a lecture on Neural Networks ────────────────────────

const MOCK_TRANSCRIPT = [
  { speaker: 'Speaker 1', text: 'The key insight behind backpropagation is that we can compute gradients layer by layer, propagating the error signal backwards through the network.', time: '02:14' },
  { speaker: 'Speaker 2', text: 'So each layer adjusts its weights based on how much it contributed to the final error?', time: '02:38' },
  { speaker: 'Speaker 1', text: 'Exactly. The chain rule lets us decompose the total gradient into local gradients at each layer. This is what makes deep learning computationally tractable.', time: '02:45' },
]

const MOCK_SUMMARY_LINES = [
  '• Backpropagation enables efficient gradient computation across deep networks',
  '• The chain rule decomposes global error into layer-local gradients',
  '• Gradient descent iteratively minimizes loss by following the steepest descent',
  '• Learning rate controls step size — too large causes divergence, too small causes stagnation',
  '• Modern optimizers (Adam, AdaGrad) adapt learning rates per-parameter',
]

const GRAPH_NODES = [
  { id: 0, label: 'Neural Networks', x: 200, y: 60, r: 8, color: '#2BA6A0' },
  { id: 1, label: 'Backpropagation', x: 100, y: 140, r: 6, color: '#5D6FE8' },
  { id: 2, label: 'Gradient Descent', x: 310, y: 130, r: 6, color: '#73CEC2' },
  { id: 3, label: 'Loss Function', x: 60, y: 220, r: 5, color: '#8793F2' },
  { id: 4, label: 'Chain Rule', x: 180, y: 210, r: 5, color: '#2BA6A0' },
  { id: 5, label: 'Learning Rate', x: 340, y: 210, r: 5, color: '#5D6FE8' },
  { id: 6, label: 'Adam Optimizer', x: 270, y: 260, r: 4, color: '#D4A34A' },
]

const GRAPH_EDGES = [
  [0, 1], [0, 2], [1, 3], [1, 4], [2, 5], [2, 6], [4, 3], [5, 6],
]

// ─── Typewriter hook ────────────────────────────────────────────────

function useTypewriter(lines: string[], speed = 30, lineDelay = 600) {
  const [visibleLines, setVisibleLines] = useState<{ text: string; done: boolean }[]>([])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      for (let li = 0; li < lines.length; li++) {
        if (cancelled) return
        const line = lines[li]
        for (let ci = 0; ci <= line.length; ci++) {
          if (cancelled) return
          await new Promise((r) => setTimeout(r, speed))
          setVisibleLines((prev) => {
            const next = [...prev]
            next[li] = { text: line.slice(0, ci), done: ci === line.length }
            return next
          })
        }
        if (li < lines.length - 1) {
          await new Promise((r) => setTimeout(r, lineDelay))
        }
      }
    }
    setVisibleLines([])
    run()
    return () => { cancelled = true }
  }, [lines, speed, lineDelay])

  return visibleLines
}

// ─── Showcase cards ─────────────────────────────────────────────────

function SpatialMappingCard() {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-black/40 p-6 shadow-2xl backdrop-blur-xl">
      <div className="mb-4">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.24em] text-[#73CEC2]">Spatial Mapping</p>
        <h3 className="font-display mt-1 text-lg font-black text-white">Map concepts, not just words.</h3>
      </div>

      <svg viewBox="0 0 400 290" className="w-full" fill="none">
        <defs>
          <linearGradient id="showcase-edge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2BA6A0" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#5D6FE8" stopOpacity="0.6" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {GRAPH_EDGES.map(([a, b], i) => (
          <motion.line
            key={`edge-${i}`}
            x1={GRAPH_NODES[a].x} y1={GRAPH_NODES[a].y}
            x2={GRAPH_NODES[b].x} y2={GRAPH_NODES[b].y}
            stroke="url(#showcase-edge)"
            strokeWidth="1.2"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.3 + i * 0.1, ease: 'easeOut' }}
          />
        ))}

        {GRAPH_NODES.map((node, i) => (
          <Fragment key={node.id}>
            {/* Glow halo */}
            <motion.circle
              cx={node.x} cy={node.y} r={node.r * 3}
              fill={node.color}
              opacity={0}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: [0, 0.15, 0.08], scale: [0.5, 1.2, 1] }}
              transition={{ duration: 2, delay: 0.5 + i * 0.12, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
              style={{ transformOrigin: `${node.x}px ${node.y}px` }}
            />
            {/* Node dot */}
            <motion.circle
              cx={node.x} cy={node.y} r={node.r}
              fill={node.color}
              filter="url(#glow)"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.4 + i * 0.1 }}
              style={{ transformOrigin: `${node.x}px ${node.y}px` }}
            />
            {/* Label */}
            <motion.text
              x={node.x}
              y={node.y + node.r + 14}
              textAnchor="middle"
              fill="rgba(255,255,255,0.55)"
              fontSize="9"
              fontFamily="var(--font-mono)"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 + i * 0.1 }}
            >
              {node.label}
            </motion.text>
          </Fragment>
        ))}
      </svg>
    </div>
  )
}

function SpeakerIntelligenceCard() {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-black/40 p-6 shadow-2xl backdrop-blur-xl">
      <div className="mb-4">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.24em] text-[#8793F2]">Speaker Intelligence</p>
        <h3 className="font-display mt-1 text-lg font-black text-white">Know who said what, instantly.</h3>
      </div>

      <div className="space-y-0 divide-y divide-white/5 rounded-2xl border border-white/10 bg-black/30">
        {MOCK_TRANSCRIPT.map((seg, i) => {
          const isSpeaker1 = i % 2 === 0
          return (
            <motion.div
              key={i}
              className="group flex cursor-pointer gap-3 px-4 py-3 transition-colors hover:bg-white/[0.03]"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...transitions.content, delay: 0.3 + i * 0.15 }}
            >
              <span className="mt-0.5 shrink-0 font-mono text-[10px] text-stone-500">{seg.time}</span>
              <div className="min-w-0 flex-1">
                <span
                  className={`mb-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                    isSpeaker1
                      ? 'bg-[#2BA6A0]/15 text-[#73CEC2]'
                      : 'bg-[#5D6FE8]/15 text-[#8793F2]'
                  }`}
                >
                  {seg.speaker}
                </span>
                <p className="text-[12px] leading-relaxed text-stone-300">{seg.text}</p>
              </div>
              <span className="my-auto grid h-5 w-5 shrink-0 place-items-center rounded-full text-stone-500 opacity-0 transition-opacity group-hover:opacity-100">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M10 8.5v7l6-3.5z" fill="currentColor" stroke="none" /></svg>
              </span>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

function AISynthesisCard() {
  const typed = useTypewriter(MOCK_SUMMARY_LINES, 18, 400)

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-black/40 p-6 shadow-2xl backdrop-blur-xl">
      <div className="mb-4">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.24em] text-[#73CEC2]">AI Synthesis</p>
        <h3 className="font-display mt-1 text-lg font-black text-white">Distill hours into seconds.</h3>
      </div>

      <div className="space-y-2 rounded-2xl border border-white/10 bg-black/30 p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-lg bg-gradient-to-br from-[#2BA6A0] to-[#5D6FE8] shadow-[0_0_12px_rgb(93_111_232/0.5)]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <path d="M9.9 2.4 11 6l3.6 1.1-3.6 1.1L9.9 12l-1.1-3.8L5.2 7.1 8.8 6z" />
              <path d="m17 14 .8 2.4 2.4.8-2.4.8L17 20.4l-.8-2.4-2.4-.8 2.4-.8z" />
            </svg>
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-widest text-stone-400">AI Summary</span>
        </div>

        {typed.map((line, i) => (
          <p key={i} className="text-[12px] leading-relaxed text-stone-300">
            {line.text}
            {!line.done && <span className="ml-0.5 inline-block animate-pulse text-[#2BA6A0]">▍</span>}
          </p>
        ))}
        {typed.length === 0 && (
          <p className="text-[12px] text-stone-500">
            <span className="animate-pulse">Generating summary…</span>
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Main export ────────────────────────────────────────────────────

export default function FeatureShowcase() {
  return (
    <section className="mx-auto max-w-5xl px-4 pb-16 pt-4">
      <motion.div
        className="mb-8 text-center"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...transitions.contentIn, delay: 0.1 }}
      >
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.3em] text-stone-500 dark:text-stone-400">
          What KnoVid produces
        </p>
        <h2 className="font-display mt-2 text-2xl font-black text-stone-900 dark:text-white">
          A <span className="gradient-ember">universe</span> from every video
        </h2>
      </motion.div>

      <motion.div
        className="grid gap-5 md:grid-cols-3"
        initial="initial"
        animate="animate"
        variants={staggerContainer({ delay: 0.12 })}
      >
        <motion.div variants={staggerItem(fadeUpLift)}>
          <SpatialMappingCard />
        </motion.div>
        <motion.div variants={staggerItem(fadeUpLift)}>
          <SpeakerIntelligenceCard />
        </motion.div>
        <motion.div variants={staggerItem(fadeUpLift)}>
          <AISynthesisCard />
        </motion.div>
      </motion.div>
    </section>
  )
}
