import { memo } from 'react'
import { motion } from 'motion/react'
import { Layers } from 'lucide-react'
import type { Chapter } from '../api/chapters'
import { usePlayhead } from '../lib/playhead'
import { formatTime } from '../utils'
import { tw, transitions } from '../lib/motion'

interface SemanticChaptersProps {
  chapters: Chapter[]
  duration: number
  onSeek: (seconds: number) => void
}

// ─── Semantic Chapter Auto-Segmentation ───────────────────────────
// The processing service splits the transcript into topic-boundary
// chapters (no manual markers needed). This rail renders each chapter
// as a proportional block on a shared timeline; the active chapter is
// highlighted as the video plays, and any block jumps you there.

function SemanticChapters({ chapters, duration, onSeek }: SemanticChaptersProps) {
  const playhead = usePlayhead()

  const total = (chapters[chapters.length - 1]?.end ?? duration) || 1
  const activeIndex = chapters.findIndex((c) => playhead >= c.start && playhead < c.end)
  const active = activeIndex >= 0 ? chapters[activeIndex] : null

  if (chapters.length === 0) return null

  return (
    <section className={`shine-card rounded-3xl p-5 ${tw.surface}`} aria-label="Chapters">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-400 dark:text-[#737373]">
          <Layers size={13} className="text-[#C17EF9]" />
          Semantic chapters
        </p>
        <span className="font-mono text-[11px] text-stone-400 dark:text-stone-500">
          {active ? `Now: ${active.title}` : `${chapters.length} auto-detected sections`}
        </span>
      </div>

      {/* Timeline: proportional, clickable chapter blocks */}
      <div
        className="group relative flex h-14 w-full cursor-pointer overflow-hidden rounded-2xl border border-black/[0.06] bg-white/70 dark:border-white/10 dark:bg-white/[0.03]"
        role="tablist"
        aria-label="Chapter timeline"
      >
        {chapters.map((c, i) => {
          const widthPct = ((c.end - c.start) / total) * 100
          const offsetPct = (c.start / total) * 100
          const isActive = i === activeIndex
          const isPast = (c.start ?? 0) <= playhead
          return (
            <button
              key={c._id ?? `ch-${i}`}
              type="button"
              aria-selected={isActive}
              aria-label={`${c.title} — ${formatTime(c.start)} to ${formatTime(c.end)}`}
              onClick={() => onSeek(c.start)}
              className="absolute top-0 h-full rounded-lg px-2 text-left outline-none transition-all focus-visible:ring-2 focus-visible:ring-[#2BA6A0]"
              style={{ left: `${offsetPct}%`, width: `${Math.max(widthPct, 0.6)}%` }}
            >
              <span
                className={`block h-full w-full rounded-lg border transition-colors duration-200 ${
                  isActive
                    ? 'border-[#2BA6A0]/70 bg-gradient-to-br from-[#2BA6A0]/55 to-[#C17EF9]/45 shadow-[0_0_18px_rgb(43_166_160/0.4)]'
                    : isPast
                      ? 'border-[#2BA6A0]/25 bg-[#2BA6A0]/12'
                      : 'border-black/5 bg-stone-200/70 group-hover:bg-[#2BA6A0]/20 dark:border-white/10 dark:bg-white/[0.06] dark:group-hover:bg-[#C17EF9]/20'
                }`}
              />
              {i === activeIndex && (
                <motion.span
                  layout
                  className="pointer-events-none absolute left-2 top-2 truncate rounded-full bg-stone-950/85 px-2 py-0.5 text-[10px] font-semibold text-[#B5E4D5]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={transitions.micro}
                >
                  {c.title}
                </motion.span>
              )}
            </button>
          )
        })}
        {/* Live playhead line */}
        {playhead > 0 && playhead <= total && (
          <span
            aria-hidden
            className="pointer-events-none absolute top-0 z-10 h-full w-px bg-[#C17EF9] shadow-[0_0_8px_rgb(193_126_249/0.9)]"
            style={{ left: `${(playhead / total) * 100}%` }}
          />
        )}
      </div>

      {/* Chapter list */}
      <ol className="mt-4 grid gap-2 sm:grid-cols-2">
        {chapters.map((c, i) => {
          const isActive = i === activeIndex
          return (
            <li key={c._id ?? `chl-${i}`}>
              <motion.button
                type="button"
                onClick={() => onSeek(c.start)}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...transitions.micro, delay: i * 0.03 }}
                className={`w-full rounded-2xl border p-3 text-left transition-colors ${
                  isActive
                    ? 'border-[#C17EF9]/50 bg-[#C17EF9]/10 dark:bg-[#C17EF9]/10'
                    : `${tw.surfaceMuted} ${tw.microHoverBg}`
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-[#2BA6A0] dark:text-[#73CEC2]">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="font-mono text-[10px] text-stone-400 dark:text-stone-500">
                    {formatTime(c.start)} – {formatTime(c.end)}
                  </span>
                </div>
                <p className="mt-1 truncate text-sm font-semibold text-stone-800 dark:text-stone-100">{c.title}</p>
                {c.keywords.length > 0 && (
                  <p className="mt-1.5 flex flex-wrap gap-1">
                    {c.keywords.slice(0, 4).map((kw) => (
                      <span key={kw} className="rounded-full border border-black/5 bg-white/60 px-2 py-0.5 text-[10px] text-stone-500 dark:border-white/10 dark:bg-stone-800/70 dark:text-stone-400">
                        {kw}
                      </span>
                    ))}
                  </p>
                )}
              </motion.button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

export default memo(SemanticChapters)