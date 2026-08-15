import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { usePlayhead } from '../lib/playhead'
import { formatTime } from '../utils'
import type { Segment } from '../api/transcripts'
import { tw, transitions, usePrefersReducedMotion, useStaggeredScrollAnimation } from '../lib/motion'
import { useToast } from './Toast'

// Warm / orchid speaker ramp — distinct hues, no blue family.
const SPEAKER_COLORS: { tag: string; accent: string }[] = [
  { tag: 'bg-[#2BA6A0]/15 text-[#155956] dark:bg-[#2BA6A0]/20 dark:text-[#73CEC2]', accent: '#2BA6A0' },
  { tag: 'bg-[#5D6FE8]/15 text-[#4555C4] dark:bg-[#5D6FE8]/20 dark:text-[#8793F2]', accent: '#5D6FE8' },
  { tag: 'bg-amber-100 text-amber-700', accent: '#C98F3D' },
  { tag: 'bg-orange-100 text-orange-700', accent: '#FB923C' },
  { tag: 'bg-pink-100 text-pink-700', accent: '#EC4899' },
  { tag: 'bg-rose-100 text-rose-700', accent: '#B75B6A' },
  { tag: 'bg-fuchsia-100 text-fuchsia-700', accent: '#5D6FE8' },
  { tag: 'bg-purple-100 text-purple-700', accent: '#7788DE' },
  { tag: 'bg-red-100 text-red-700', accent: '#EF4444' },
  { tag: 'bg-yellow-100 text-yellow-700', accent: '#EAB308' },
]

// Per-instance speaker palette: colors are stable within a transcript view
// and reset when the component unmounts (no cross-video drift).
function useSpeakerColors() {
  const mapRef = useRef(new Map<string, { tag: string; accent: string }>())
  const idxRef = useRef(0)
  return useCallback((speaker: string) => {
    const map = mapRef.current
    let entry = map.get(speaker)
    if (!entry) {
      entry = SPEAKER_COLORS[idxRef.current % SPEAKER_COLORS.length]
      idxRef.current += 1
      map.set(speaker, entry)
    }
    return entry
  }, [])
}

interface Group { speaker: string; segments: Segment[] }

function groupBySpeaker(segments: Segment[]): Group[] {
  const groups: Group[] = []
  for (const seg of segments) {
    const speaker = seg.speaker || 'Speaker'
    const last = groups[groups.length - 1]
    if (last && last.speaker === speaker) {
      last.segments.push(seg)
    } else {
      groups.push({ speaker, segments: [seg] })
    }
  }
  return groups
}

function vttTime(seconds: number): string {
  const s = Math.max(0, seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  const ms = Math.round((s % 1) * 1000)
  const pad = (n: number, len = 2) => n.toString().padStart(len, '0')
  return `${pad(h)}:${pad(m)}:${pad(sec)}.${pad(ms, 3)}`
}

function srtTime(seconds: number): string {
  return vttTime(seconds).replace('.', ',')
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text
  const qi = query.toLowerCase()
  const lower = text.toLowerCase()
  const out: React.ReactNode[] = []
  let i = 0
  let idx = lower.indexOf(qi)
  while (idx >= 0) {
    if (idx > i) out.push(text.slice(i, idx))
    out.push(
      <mark key={idx} className="rounded-sm bg-[#2BA6A0]/25 px-0.5 text-inherit dark:bg-[#5D6FE8]/30">{text.slice(idx, idx + query.length)}</mark>
    )
    i = idx + query.length
    idx = lower.indexOf(qi, i)
  }
  if (i < text.length) out.push(text.slice(i))
  return out.length ? out : text
}

interface TranscriptSectionProps {
  videoId: string
  segments: Segment[]
  langLabel: string
  onSeek: (seconds: number) => void
}

function TranscriptSection({ videoId, segments, langLabel, onSeek }: TranscriptSectionProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeMatch, setActiveMatch] = useState(0)
  const [autoScroll, setAutoScroll] = useState(true)
  const [manualPaused, setManualPaused] = useState(false)
  const manualScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const segmentEls = useRef<Map<number, HTMLElement>>(new Map())
  const matchEls = useRef<Map<number, HTMLElement>>(new Map())
  const reduced = usePrefersReducedMotion()
  const playhead = usePlayhead()
  const getSpeakerColor = useSpeakerColors()
  const { toast } = useToast()

  const groups = useMemo(() => (segments.length > 0 ? groupBySpeaker(segments) : []), [segments])
  const { ref: staggerScrollRef, visibleItems: visibleTranscriptGroups } = useStaggeredScrollAnimation(groups.length)

  const flatSegments = useMemo(() => {
    const out: { speaker: string; seg: Segment; idx: number }[] = []
    let i = 0
    for (const g of groups) for (const seg of g.segments) out.push({ speaker: g.speaker, seg, idx: i++ })
    return out
  }, [groups])

  const searchQueryNorm = searchQuery.trim().toLowerCase()
  const matches = useMemo(
    () => (searchQueryNorm ? flatSegments.filter((f) => f.seg.text.toLowerCase().includes(searchQueryNorm)) : []),
    [flatSegments, searchQueryNorm]
  )
  const searching = searchQueryNorm.length > 0 && matches.length > 0

  useEffect(() => setActiveMatch(0), [searchQuery])
  useEffect(() => {
    if (!searching) return
    const el = matchEls.current.get(activeMatch)
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeMatch, searching])

  const goMatch = (dir: 1 | -1) => {
    if (matches.length === 0) return
    const next = (activeMatch + dir + matches.length) % matches.length
    setActiveMatch(next)
    onSeek(matches[next].seg.start)
  }

  // Transcript ↔ playback sync — playhead comes from the external store so
  // only this subtree re-renders on every timeupdate, not the whole page.
  const activeSegmentIdx = useMemo(() => {
    if (segments.length === 0) return -1
    let idx = -1
    for (let i = 0; i < segments.length; i++) {
      if (playhead >= segments[i].start) idx = i
      else break
    }
    return idx
  }, [segments, playhead])

  useEffect(() => {
    if (activeSegmentIdx < 0 || reduced || !autoScroll || manualPaused) return
    const el = segmentEls.current.get(activeSegmentIdx)
    if (el && transcriptRef.current) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [activeSegmentIdx, reduced, autoScroll, manualPaused])

  // Pausing auto-scroll while the user scrolls, resuming after 3s of inactivity.
  const pauseAutoScroll = useCallback(() => {
    if (manualScrollTimer.current) clearTimeout(manualScrollTimer.current)
    setManualPaused(true)
    manualScrollTimer.current = setTimeout(() => setManualPaused(false), 3000)
  }, [])

  useEffect(() => () => {
    if (manualScrollTimer.current) clearTimeout(manualScrollTimer.current)
  }, [])

  const copyTranscript = async () => {
    const text = flatSegments
      .map((f) => `[${formatTime(f.seg.start)}] ${f.speaker}: ${f.seg.text}`)
      .join('\n')
    try {
      await navigator.clipboard.writeText(text)
      toast('Transcript copied to clipboard', 'success')
    } catch {
      toast('Copy failed', 'error')
    }
  }

  const exportSubtitles = (format: 'vtt' | 'srt') => {
    const cue = flatSegments
      .map((f, i) => {
        const start = format === 'vtt' ? vttTime(f.seg.start) : srtTime(f.seg.start)
        const end = format === 'vtt' ? vttTime(f.seg.end) : srtTime(f.seg.end)
        const body = `${start} --> ${end}\n${f.speaker}: ${f.seg.text}`
        return format === 'vtt' ? body : `${i + 1}\n${body}`
      })
      .join('\n\n')
    const file = format === 'vtt' ? `WEBVTT\n\n${cue}\n` : cue
    const blob = new Blob([file], { type: format === 'vtt' ? 'text/vtt' : 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `knovid-${videoId.slice(-8)}.${format}`
    a.click()
    URL.revokeObjectURL(url)
    toast(`Exported as .${format.toUpperCase()}`, 'success')
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-[#2BA6A0]/40 bg-[#2BA6A0]/10 px-2.5 py-0.5 text-xs font-semibold uppercase text-[#155956] dark:border-[#2BA6A0]/30 dark:bg-[#2BA6A0]/[0.08] dark:text-[#73CEC2]">
          {langLabel}
        </span>
        <span className="text-xs text-gray-500 dark:text-stone-400">{segments.length} segments &middot; {groups.length} turns</span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className={`relative flex items-center gap-1 rounded-xl border px-2 py-1.5 ${searchQuery ? 'border-[#2BA6A0]/60 dark:border-[#5D6FE8]/50' : 'border-stone-200 dark:border-white/10'} bg-white/80 dark:bg-stone-800/70`}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-stone-400"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" strokeLinecap="round" /></svg>
            <input
              aria-label="Search transcript"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search transcript…"
              className="w-28 bg-transparent text-xs text-stone-800 outline-none placeholder:text-stone-400 sm:w-36 dark:text-stone-100 dark:placeholder:text-stone-500"
            />
            {searching && (
              <span className="whitespace-nowrap font-mono text-[10px] text-[#1D7773] dark:text-[#73CEC2]">{activeMatch + 1}/{matches.length}</span>
            )}
            <button type="button" onClick={() => goMatch(-1)} disabled={!searching} aria-label="Previous match" className="grid h-5 w-5 place-items-center rounded text-stone-400 transition-colors hover:text-stone-700 disabled:opacity-30 dark:hover:text-stone-100">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <button type="button" onClick={() => goMatch(1)} disabled={!searching} aria-label="Next match" className="grid h-5 w-5 place-items-center rounded text-stone-400 transition-colors hover:text-stone-700 disabled:opacity-30 dark:hover:text-stone-100">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>

          <button type="button" onClick={copyTranscript} aria-label="Copy transcript" title="Copy transcript"
            className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white/80 px-2.5 py-1.5 text-xs font-medium text-stone-600 transition-colors hover:border-[#2BA6A0]/60 hover:text-[#1D7773] dark:border-white/10 dark:bg-stone-800/70 dark:text-stone-300 dark:hover:border-[#5D6FE8]/50 dark:hover:text-[#73CEC2]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
            Copy
          </button>

          <button type="button" onClick={exportSubtitles.bind(null, 'vtt')} title="Export .VTT subtitles"
            className="rounded-xl border border-stone-200 bg-white/80 px-2.5 py-1.5 text-xs font-medium text-stone-600 transition-colors hover:border-[#2BA6A0]/60 hover:text-[#1D7773] dark:border-white/10 dark:bg-stone-800/70 dark:text-stone-300 dark:hover:border-[#5D6FE8]/50 dark:hover:text-[#8793F2]">
            .VTT
          </button>
          <button type="button" onClick={exportSubtitles.bind(null, 'srt')} title="Export .SRT subtitles"
            className="rounded-xl border border-stone-200 bg-white/80 px-2.5 py-1.5 text-xs font-medium text-stone-600 transition-colors hover:border-rose-300 hover:text-rose-700 dark:border-white/10 dark:bg-stone-800/70 dark:text-stone-300 dark:hover:text-rose-300">
            .SRT
          </button>

          <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-gray-500 dark:text-stone-400">
            <span className="relative inline-flex h-4 w-7 items-center rounded-full transition-colors" style={{ background: autoScroll ? '#2BA6A0' : '#737373' }}>
              <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${autoScroll ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
            </span>
            <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} className="sr-only" />
            Auto-scroll
          </label>
        </div>
      </div>

      {searching ? (
        <div
          ref={transcriptRef}
          style={{ maxHeight: 480 }}
          onWheel={pauseAutoScroll}
          onTouchStart={pauseAutoScroll}
          className={`rounded-2xl border divide-y overflow-y-auto ${tw.surface} dark:divide-white/10`}
        >
          {matches.map((f, i) => {
            const active = i === activeMatch
            const accent = getSpeakerColor(f.speaker).accent
            return (
              <div
                key={f.idx}
                ref={(el) => {
                  if (el) matchEls.current.set(i, el)
                  else matchEls.current.delete(i)
                }}
                role="button"
                tabIndex={0}
                aria-label={`Jump to ${formatTime(f.seg.start)}`}
                onClick={() => onSeek(f.seg.start)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSeek(f.seg.start)
                  }
                }}
                className={`seg-row group flex cursor-pointer gap-4 px-4 py-2.5 transition-colors duration-200 ease-out ${active ? 'active transcript-active' : 'hover:bg-[#2BA6A0]/5 dark:hover:bg-stone-800/60'}`}
                style={{ ['--seg-accent' as string]: accent } as React.CSSProperties}
              >
                <span className="seg-bar" />
                <span style={{ minWidth: 48 }} className={`mt-0.5 whitespace-nowrap font-mono text-xs ${active ? 'font-semibold text-[#1D7773] dark:text-[#73CEC2]' : 'text-gray-400 dark:text-stone-500'}`}>
                  {formatTime(f.seg.start)}
                </span>
                <div className="min-w-0 flex-1">
                  <span className={`mb-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${getSpeakerColor(f.speaker).tag}`}>{f.speaker}</span>
                  <p className={`text-sm ${active ? 'text-[#9A3412] dark:text-[#FFE4D6]' : 'text-gray-800 dark:text-stone-200'}`}>
                    {highlight(f.seg.text, searchQuery)}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div
          ref={transcriptRef}
          style={{ maxHeight: 480 }}
          onWheel={pauseAutoScroll}
          onTouchStart={pauseAutoScroll}
          className={`rounded-2xl border p-2 space-y-2 overflow-y-auto ${tw.surface}`}
        >
          {(() => {
            let flatIdx = 0
            return (
              <div ref={staggerScrollRef}>
                {groups.map((group, gi) => {
                  const accent = getSpeakerColor(group.speaker).accent
                  const isVisible = visibleTranscriptGroups.has(gi)
                  return (
                    <motion.div
                      key={gi}
                      initial={{ opacity: 0, y: 20 }}
                      animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1], delay: gi * 0.05 }}
                      className="relative overflow-hidden rounded-xl border border-white/70 bg-white/60 dark:border-white/10 dark:bg-stone-900/40"
                    >
                      <motion.span
                        className="absolute bottom-0 left-0 top-0 w-1 rounded-r-full shadow-[0_0_12px_var(--seg-accent)]"
                        style={{ background: accent, transformOrigin: 'top', ['--seg-accent' as string]: accent }}
                        initial={{ scaleY: 0 }}
                        animate={{ scaleY: 1 }}
                        transition={{ ...transitions.content, delay: gi * 0.05 }}
                      />
                      <div className="flex items-center gap-2 border-b border-stone-200/70 px-4 py-2 bg-white/60 dark:border-white/10 dark:bg-stone-900/50">
                        <motion.span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm ${getSpeakerColor(group.speaker).tag}`}
                          initial={{ opacity: 0, x: -4 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={transitions.contentIn}
                        >
                          <span className="h-2 w-0.5 rounded-full" style={{ background: accent }} />
                          {group.speaker}
                        </motion.span>
                        <span className="text-xs text-gray-400 dark:text-stone-500">{group.segments.length} segs</span>
                      </div>
                      <div className="p-1.5">
                        {group.segments.map((seg) => {
                          const idx = flatIdx++
                          const active = idx === activeSegmentIdx
                          return (
                            <motion.div
                              key={idx}
                              ref={(el) => {
                                if (el) segmentEls.current.set(idx, el)
                                else segmentEls.current.delete(idx)
                              }}
                              data-active={active}
                              role="button"
                              tabIndex={0}
                              aria-label={`Play from ${formatTime(seg.start)}`}
                              onClick={() => onSeek(seg.start)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  onSeek(seg.start)
                                }
                              }}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ duration: 0.2, delay: gi * 0.05 + (idx % group.segments.length) * 0.02 }}
                              className={`seg-row group flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 transition-all duration-200 ease-out ${active ? 'active transcript-active' : 'hover:bg-white/80 dark:hover:bg-stone-800/50'}`}
                              style={{ ['--seg-accent' as string]: accent } as React.CSSProperties}
                            >
                              <span className="seg-bar" />
                              <span
                                className={`mt-0.5 shrink-0 rounded-md border px-1.5 py-0.5 whitespace-nowrap font-mono text-[11px] backdrop-blur-sm ${active ? 'font-bold border-[#2BA6A0]/40 bg-[#2BA6A0]/10 text-[#1D7773] dark:border-[#5D6FE8]/40 dark:bg-[#5D6FE8]/10 dark:text-[#73CEC2]' : 'border-transparent text-gray-400 dark:text-stone-500'} group-hover:border-[#2BA6A0]/30 group-hover:text-[#155956] dark:group-hover:text-[#73CEC2]`}
                              >
                                {formatTime(seg.start)}
                              </span>
                              <p className={`flex-1 text-sm leading-relaxed ${active ? 'text-[#9A3412] dark:text-[#FFE4D6]' : 'text-gray-800 dark:text-stone-200'}`}>{seg.text}</p>
                              <span className="mt-0.5 shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                                <span
                                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white shadow-[0_0_12px_rgb(93_111_232/0.5)]"
                                  style={{ background: accent }}
                                >
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86a1 1 0 0 0-1.5.86z" /></svg>
                                  Play from here
                                </span>
                              </span>
                            </motion.div>
                          )
                        })}
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            )
          })()}
        </div>
      )}
    </section>
  )
}

export default memo(TranscriptSection)