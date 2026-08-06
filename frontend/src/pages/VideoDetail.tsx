import { useState, useMemo, useRef, useCallback, useEffect, lazy, Suspense, Fragment } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { useAuth } from '../context/AuthContext'
import { useFetch } from '../hooks/useFetch'
import { getVideo, retryVideo, isProcessing, type Video } from '../api/videos'
import { getTranscript, type Transcript, type Segment } from '../api/transcripts'
import { getGraph, type Graph, type GraphNode } from '../api/graphs'
import { translateVideo } from '../api/translate'
import {
  generateContent,
  askQuestion,
  exportVideo,
  type GeneratedContent,
} from '../api/generate'
import { formatTime } from '../utils'
import { getResume, setResume, clearResume } from '../lib/resume'
import { contentStream, staggerContainer, staggerItem, materialize, chatBubble, transitions, tw, usePrefersReducedMotion } from '../lib/motion'
import { useToast } from '../components/Toast'
import ThemeToggle from '../components/ThemeToggle'
import VideoPlayer, { type VideoPlayerHandle } from '../components/VideoPlayer'
const TopicTree = lazy(() => import('../components/TopicTree'))
const KnowledgeGraph = lazy(() => import('../components/KnowledgeGraph'))
const NeuralNavigator = lazy(() => import('../components/NeuralNavigator'))

const LANGUAGES = [
  { code: '', label: 'Original' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'hi', label: 'Hindi' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ar', label: 'Arabic' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
]

// Warm / orchid speaker ramp — distinct hues, no blue family.
const SPEAKER_COLORS: { tag: string; accent: string }[] = [
  { tag: 'bg-amber-100 text-amber-700', accent: '#C98F3D' },
  { tag: 'bg-orange-100 text-orange-700', accent: '#FB923C' },
  { tag: 'bg-pink-100 text-pink-700', accent: '#EC4899' },
  { tag: 'bg-rose-100 text-rose-700', accent: '#F43F5E' },
  { tag: 'bg-fuchsia-100 text-fuchsia-700', accent: '#D946EF' },
  { tag: 'bg-purple-100 text-purple-700', accent: '#A855F7' },
  { tag: 'bg-red-100 text-red-700', accent: '#EF4444' },
  { tag: 'bg-yellow-100 text-yellow-700', accent: '#EAB308' },
]

const speakerColorMap = new Map<string, { tag: string; accent: string }>()
let colorIdx = 0

function getSpeakerColor(speaker: string): { tag: string; accent: string } {
  if (!speakerColorMap.has(speaker)) {
    speakerColorMap.set(speaker, SPEAKER_COLORS[colorIdx % SPEAKER_COLORS.length])
    colorIdx++
  }
  return speakerColorMap.get(speaker)!
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

const ENTITY_ICONS: Record<string, string> = {
  PERSON: '👤', ORG: '🏢', GPE: '📍', LOC: '📍',
  PRODUCT: '📦', EVENT: '📅', WORK_OF_ART: '🎨', LAW: '⚖️',
}

type MainTab = 'transcript' | 'graph' | 'generate'
type GraphView = 'neural' | 'tree' | 'network' | 'list'

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
      <mark key={idx} className="rounded-sm bg-[#FF6B35]/25 px-0.5 text-inherit dark:bg-[#D946EF]/30">{text.slice(idx, idx + query.length)}</mark>
    )
    i = idx + query.length
    idx = lower.indexOf(qi, i)
  }
  if (i < text.length) out.push(text.slice(i))
  return out.length ? out : text
}

export default function VideoDetail() {
  const { id } = useParams<{ id: string }>()
  const [mainTab, setMainTab] = useState<MainTab>('transcript')
  const [graphView, setGraphView] = useState<GraphView>('neural')
  const [targetLang, setTargetLang] = useState('')
  const [translatedSegments, setTranslatedSegments] = useState<Segment[] | null>(null)
  const [translatedLabels, setTranslatedLabels] = useState<Record<string, string> | null>(null)
  const [translating, setTranslating] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const lastSavedResume = useRef(0)
  const playerRef = useRef<VideoPlayerHandle>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const segmentEls = useRef<Map<number, HTMLElement>>(new Map())
  const reduced = usePrefersReducedMotion()
  const [retrying, setRetrying] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [resumeAt, setResumeAt] = useState<number | null>(() => (id ? getResume(id) : null))
  const [searchQuery, setSearchQuery] = useState('')
  const [activeMatch, setActiveMatch] = useState(0)
  const matchEls = useRef<Map<number, HTMLElement>>(new Map())
  const [manualPaused, setManualPaused] = useState(false)
  const manualScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { toast } = useToast()

  const { data: video, loading: loadingVideo } = useFetch<Video | null>(
    () => (id ? getVideo(id) : Promise.reject()), [id]
  )
  const { data: transcript, loading: loadingTranscript } = useFetch<Transcript | null>(
    () => (id && (video?.status === 'analyzing' || video?.status === 'done') ? getTranscript(id).catch(() => null) : Promise.resolve(null)), [id, video?.status]
  )
  const { data: graph } = useFetch<Graph | null>(
    () => (id && video?.status === 'done' ? getGraph(id).catch(() => null) : Promise.resolve(null)), [id, video?.status]
  )

  useEffect(() => {
    if (!id || !transcript || !targetLang) {
      setTranslatedSegments(null)
      setTranslatedLabels(null)
      return
    }
    let cancelled = false
    setTranslating(true)
    translateVideo(id, targetLang)
      .then((res) => {
        if (!cancelled) {
          setTranslatedSegments(res.segments)
          setTranslatedLabels(res.nodeLabels)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setTranslating(false)
      })
    return () => { cancelled = true }
  }, [id, transcript, targetLang])

  useEffect(() => {
    if (!id || !video || !isProcessing(video.status)) return
    const interval = setInterval(async () => {
      try {
        const updated = await getVideo(id)
        if (!isProcessing(updated.status)) {
          window.location.reload()
        }
      } catch {}
    }, 4000)
    return () => clearInterval(interval)
  }, [id, video])

  const displaySegments = useMemo(
    () => (translatedSegments && targetLang ? translatedSegments : transcript?.segments ?? []),
    [translatedSegments, transcript, targetLang]
  )

  const displayNodes: GraphNode[] = useMemo(() => {
    if (!graph) return []
    if (!translatedLabels || !targetLang) return graph.nodes
    return graph.nodes.map((n) => ({
      ...n,
      label: translatedLabels[n.id] || n.label,
    }))
  }, [graph, translatedLabels, targetLang])

  const groups = useMemo(() => (displaySegments.length > 0 ? groupBySpeaker(displaySegments) : []), [displaySegments])

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
    handleSeek(matches[next].seg.start)
  }
  const entities = useMemo(() => displayNodes.filter((n) => n.type === 'entity') ?? [], [displayNodes])
  const topics = useMemo(() => displayNodes.filter((n) => n.type === 'topic') ?? [], [displayNodes])
  const keywords = useMemo(() => displayNodes.filter((n) => n.type === 'keyword') ?? [], [displayNodes])

  const handleSeek = useCallback((seconds: number) => {
    playerRef.current?.seekTo(seconds)
  }, [])

  // Track playhead + persist a resume position (throttled, ~5s).
  const handleTimeUpdate = useCallback(
    (seconds: number) => {
      setCurrentTime(seconds)
      if (!id) return
      const dur = video?.duration ?? 0
      if (dur > 0 && seconds >= dur - 5) {
        clearResume(id)
        return
      }
      if (seconds - lastSavedResume.current < 5) return
      lastSavedResume.current = seconds
      setResume(id, seconds)
    },
    [id, video?.duration]
  )

  const handleResume = () => {
    if (resumeAt == null) return
    playerRef.current?.seekTo(resumeAt)
    setResumeAt(null)
  }

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
    a.download = `knovid-${id?.slice(-8)}.${format}`
    a.click()
    URL.revokeObjectURL(url)
    toast(`Exported as .${format.toUpperCase()}`, 'success')
  }

  // ── Transcript ↔ playback sync ────────────────────────────────
  const activeSegmentIdx = useMemo(() => {
    if (displaySegments.length === 0) return -1
    let idx = -1
    for (let i = 0; i < displaySegments.length; i++) {
      if (currentTime >= displaySegments[i].start) idx = i
      else break
    }
    return idx
  }, [displaySegments, currentTime])

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

  const originalLang = transcript?.language || 'en'

  const handleRetry = async () => {
    if (!id) return
    setRetrying(true)
    try {
      await retryVideo(id)
      window.location.reload()
    } catch {
      setRetrying(false)
      toast('Could not retry processing', 'error')
    }
  }

  const loading = loadingVideo || loadingTranscript
  if (loading) {
    return <WorkspaceSkeleton />
  }
  if (!video) return null

  return (
    <div className="min-h-screen bg-[#FAFAFA] dark:bg-[#0A0A0A]">
      {/* ── Command header ───────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-black/10 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-[#0A0A0A]/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => navigate('/')}
              aria-label="Back to dashboard"
              className="grid h-9 w-9 place-items-center rounded-full border border-black/10 bg-white/75 text-stone-500 transition-all duration-200 hover:-translate-x-0.5 hover:border-[#FF6B35]/60 hover:text-[#EA580C] dark:border-white/10 dark:bg-stone-800/80 dark:text-stone-300 dark:hover:border-[#D946EF]/60 dark:hover:text-[#FF8A5C]"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <div className="min-w-0">
              <p className="font-display text-[11px] font-semibold uppercase tracking-[0.24em] text-[#EA580C] dark:text-[#FF8A5C]">KnoVid analysis</p>
              <h1 className="font-display truncate text-lg font-black tracking-tight text-stone-900 dark:text-white">{video.originalName}</h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden text-sm text-stone-600 sm:inline dark:text-stone-300">{user?.name}</span>
            <ThemeToggle />
            <button
              onClick={logout}
              className="rounded-full border border-red-200 bg-white/70 px-3 py-1.5 text-sm text-red-600 transition-colors hover:bg-red-50 dark:border-red-400/30 dark:bg-stone-800/70 dark:text-red-400 dark:hover:bg-red-500/10"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        {/* ── Player with orchid glow + pill badges ─────────────── */}
        <motion.div
          className="relative overflow-hidden rounded-3xl border border-black/10 bg-white/70 p-2 shadow-[0_0_60px_rgb(217_70_239/0.14),0_0_130px_rgb(255_107_53/0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-stone-900/70 dark:shadow-[0_0_70px_rgb(217_70_239/0.20),0_0_150px_rgb(255_107_53/0.12)]"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={transitions.content}
        >
          <VideoPlayer ref={playerRef} url={video.url} filePath={video.filePath} onTimeUpdate={handleTimeUpdate} />
          {resumeAt != null && resumeAt > 15 && video.status === 'done' && (
            <motion.button
              type="button"
              onClick={handleResume}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={transitions.content}
              className="absolute right-5 top-5 z-30 flex items-center gap-2 rounded-full border border-[#FF6B35]/50 bg-stone-950/85 px-3 py-1.5 text-xs font-semibold text-[#FFB58C] shadow-lg backdrop-blur-md transition-all hover:scale-[1.03] hover:bg-stone-900"
              aria-label={`Resume at ${formatTime(resumeAt)}`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86a1 1 0 0 0-1.5.86z" /></svg>
              Resume at {formatTime(resumeAt)}
            </motion.button>
          )}
        </motion.div>

        {/* ── Pills + controls ──────────────────────────────────── */}
        <motion.div
          className="mt-5 flex flex-wrap items-center gap-2"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...transitions.content, delay: 0.06 }}
        >
          <Chip tone="tangerine">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86a1 1 0 0 0-1.5.86z" /></svg>
            <span className="max-w-[16rem] truncate">{video.originalName}</span>
          </Chip>
          <Chip tone="orchid">Language · {originalLang}</Chip>
          {video.duration > 0 && <Chip>{formatTime(video.duration)}</Chip>}

          <div className="relative ml-auto inline-flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-stone-400 dark:text-[#737373]">Language</span>
            <select
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              aria-label="Translate to language"
              className="appearance-none rounded-full border border-black/10 bg-white/70 py-1.5 pl-3 pr-8 text-xs font-semibold text-stone-700 outline-none transition-colors focus:border-[#FF6B35]/60 dark:border-white/15 dark:bg-white/[0.04] dark:text-stone-200 dark:focus:border-[#D946EF]/60"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
            <svg className="pointer-events-none absolute right-3 text-stone-400" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>

          {targetLang && (
            <motion.span
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-1.5 text-xs"
            >
              {translating ? (
                <Chip tone="orchid"><Spinner /> Translating…</Chip>
              ) : translatedSegments ? (
                <Chip tone="tangerine">
                  → {LANGUAGES.find((l) => l.code === targetLang)?.label}
                </Chip>
              ) : (
                <Chip>Install LLM_API_KEY for translations</Chip>
              )}
            </motion.span>
          )}
        </motion.div>

        {/* ── Pipeline stepper ──────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...transitions.content, delay: 0.12 }}
        >
          <PipelineStepper
            status={video.status}
            onRetry={handleRetry}
            retrying={retrying}
            errorMessage={video.errorMessage}
            duration={video.duration}
          />
        </motion.div>

        {/* ── Tabs ──────────────────────────────────────────────── */}
        <div className="mt-6 flex gap-1 rounded-2xl border border-black/10 bg-white/65 p-1 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-stone-900/70">
          <TabBtn active={mainTab === 'transcript'} onClick={() => setMainTab('transcript')}>Transcript</TabBtn>
          <TabBtn active={mainTab === 'graph'} onClick={() => setMainTab('graph')} disabled={!transcript}>
            Knowledge Graph {graph ? `(${graph.nodes.length})` : ''}
          </TabBtn>
          <TabBtn active={mainTab === 'generate'} onClick={() => setMainTab('generate')} disabled={!transcript}>AI Chat</TabBtn>
        </div>

        {/* ── Output ────────────────────────────────────────────── */}
        <div className="mt-5 min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={mainTab}
              initial={contentStream.initial}
              animate={contentStream.animate}
              exit={{ opacity: 0 }}
              transition={transitions.micro}
            >
              {mainTab === 'transcript' && (displaySegments.length > 0 ? (
                <section>
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-[#FF6B35]/40 bg-[#FF6B35]/10 px-2.5 py-0.5 text-xs font-semibold uppercase text-[#C2410C] dark:border-[#FF6B35]/30 dark:bg-[#FF6B35]/[0.08] dark:text-[#FF8A5C]">
                      {targetLang || originalLang}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-stone-400">{displaySegments.length} segments &middot; {groups.length} turns</span>

                    <div className="ml-auto flex flex-wrap items-center gap-2">
                      <div className={`relative flex items-center gap-1 rounded-xl border px-2 py-1.5 ${searchQuery ? 'border-[#FF6B35]/60 dark:border-[#D946EF]/50' : 'border-stone-200 dark:border-white/10'} bg-white/80 dark:bg-stone-800/70`}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-stone-400"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" strokeLinecap="round" /></svg>
                        <input
                          aria-label="Search transcript"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search transcript…"
                          className="w-28 bg-transparent text-xs text-stone-800 outline-none placeholder:text-stone-400 sm:w-36 dark:text-stone-100 dark:placeholder:text-stone-500"
                        />
                        {searching && (
                          <span className="whitespace-nowrap font-mono text-[10px] text-[#EA580C] dark:text-[#FF8A5C]">{activeMatch + 1}/{matches.length}</span>
                        )}
                        <button type="button" onClick={() => goMatch(-1)} disabled={!searching} aria-label="Previous match" className="grid h-5 w-5 place-items-center rounded text-stone-400 transition-colors hover:text-stone-700 disabled:opacity-30 dark:hover:text-stone-100">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </button>
                        <button type="button" onClick={() => goMatch(1)} disabled={!searching} aria-label="Next match" className="grid h-5 w-5 place-items-center rounded text-stone-400 transition-colors hover:text-stone-700 disabled:opacity-30 dark:hover:text-stone-100">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </button>
                      </div>

                      <button type="button" onClick={copyTranscript} aria-label="Copy transcript" title="Copy transcript"
                        className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white/80 px-2.5 py-1.5 text-xs font-medium text-stone-600 transition-colors hover:border-[#FF6B35]/60 hover:text-[#EA580C] dark:border-white/10 dark:bg-stone-800/70 dark:text-stone-300 dark:hover:border-[#D946EF]/50 dark:hover:text-[#FF8A5C]">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
                        Copy
                      </button>

                      <button type="button" onClick={exportSubtitles.bind(null, 'vtt')} title="Export .VTT subtitles"
                        className="rounded-xl border border-stone-200 bg-white/80 px-2.5 py-1.5 text-xs font-medium text-stone-600 transition-colors hover:border-emerald-300 hover:text-emerald-700 dark:border-white/10 dark:bg-stone-800/70 dark:text-stone-300 dark:hover:text-emerald-300">
                        .VTT
                      </button>
                      <button type="button" onClick={exportSubtitles.bind(null, 'srt')} title="Export .SRT subtitles"
                        className="rounded-xl border border-stone-200 bg-white/80 px-2.5 py-1.5 text-xs font-medium text-stone-600 transition-colors hover:border-rose-300 hover:text-rose-700 dark:border-white/10 dark:bg-stone-800/70 dark:text-stone-300 dark:hover:text-rose-300">
                        .SRT
                      </button>

                      <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-gray-500 dark:text-stone-400">
                        <span className="relative inline-flex h-4 w-7 items-center rounded-full transition-colors" style={{ background: autoScroll ? '#FF6B35' : '#737373' }}>
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
                            onClick={() => handleSeek(f.seg.start)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                handleSeek(f.seg.start)
                              }
                            }}
                            className={`seg-row group flex cursor-pointer gap-4 px-4 py-2.5 transition-colors duration-200 ease-out ${active ? 'active transcript-active' : 'hover:bg-[#FF6B35]/5 dark:hover:bg-stone-800/60'}`}
                            style={{ ['--seg-accent' as string]: accent } as React.CSSProperties}
                          >
                            <span className="seg-bar" />
                            <span style={{ minWidth: 48 }} className={`mt-0.5 whitespace-nowrap font-mono text-xs ${active ? 'font-semibold text-[#EA580C] dark:text-[#FF8A5C]' : 'text-gray-400 dark:text-stone-500'}`}>
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
                      className={`rounded-2xl border divide-y overflow-y-auto ${tw.surface} dark:divide-white/10`}
                    >
                      {(() => {
                        let flatIdx = 0
                        return groups.map((group, gi) => {
                          const accent = getSpeakerColor(group.speaker).accent
                          return (
                            <div key={gi} className="relative">
                              <motion.span
                                className="absolute bottom-0 left-0 top-0 w-0.5 rounded-r-full"
                                style={{ background: accent, transformOrigin: 'top' }}
                                initial={{ scaleY: 0 }}
                                animate={{ scaleY: 1 }}
                                transition={{ ...transitions.content, delay: gi * 0.05 }}
                              />
                              <div className="flex items-center gap-2 border-b px-4 py-2 bg-stone-50/75 dark:border-white/10 dark:bg-stone-800/60">
                                <motion.span
                                  className={`inline-flex items-center gap-1 rounded ${getSpeakerColor(group.speaker).tag}`}
                                  initial={{ opacity: 0, x: -4 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={transitions.contentIn}
                                >
                                  <span className="h-2 w-0.5 rounded-full" style={{ background: accent }} />
                                  <span className="px-1 py-0.5 text-xs font-medium">{group.speaker}</span>
                                </motion.span>
                                <span className="text-xs text-gray-400 dark:text-stone-500">{group.segments.length} segs</span>
                              </div>
                              {group.segments.map((seg) => {
                                const idx = flatIdx++
                                const active = idx === activeSegmentIdx
                                return (
                                  <div
                                    key={idx}
                                    ref={(el) => {
                                      if (el) segmentEls.current.set(idx, el)
                                      else segmentEls.current.delete(idx)
                                    }}
                                    data-active={active}
                                    role="button"
                                    tabIndex={0}
                                    aria-label={`Jump to ${formatTime(seg.start)}`}
                                    onClick={() => handleSeek(seg.start)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault()
                                        handleSeek(seg.start)
                                      }
                                    }}
                                    className={`seg-row group flex cursor-pointer gap-4 px-4 py-2.5 transition-colors duration-200 ease-out ${active ? 'active transcript-active' : 'hover:bg-[#FF6B35]/5 dark:hover:bg-stone-800/60'}`}
                                    style={{ ['--seg-accent' as string]: accent } as React.CSSProperties}
                                  >
                                    <span className="seg-bar" />
                                    <span style={{ minWidth: 48 }} className={`mt-0.5 whitespace-nowrap font-mono text-xs ${active ? 'font-semibold text-[#EA580C] dark:text-[#FF8A5C]' : 'text-gray-400 dark:text-stone-500'} group-hover:text-[#EA580C] dark:group-hover:text-[#FF8A5C]`}>
                                      {formatTime(seg.start)}
                                    </span>
                                    <p className={`flex-1 text-sm ${active ? 'text-[#9A3412] dark:text-[#FFE4D6]' : 'text-gray-800 dark:text-stone-200'}`}>{seg.text}</p>
                                    <span className="my-auto mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-stone-400 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M10 8.5v7l6-3.5z" fill="currentColor" stroke="none" /></svg>
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })
                      })()}
                    </div>
                  )}
                </section>
              ) : video.status === 'done' ? (
                <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-[#FF6B35]/40 bg-white/65 py-16 text-center text-stone-500 backdrop-blur-xl dark:border-[#D946EF]/40 dark:bg-stone-900/50 dark:text-stone-400">
                  No transcript.
                </div>
              ) : (
                <OutputSkeleton lines={5} />
              ))}

              {mainTab === 'graph' && (graph ? (
                <div>
                  <div className="mb-4 flex gap-1 rounded-2xl border border-black/10 bg-white/65 p-1 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-stone-900/70">
                    <ViewBtn active={graphView === 'neural'} onClick={() => setGraphView('neural')}>Neural</ViewBtn>
                    <ViewBtn active={graphView === 'tree'} onClick={() => setGraphView('tree')}>Tree</ViewBtn>
                    <ViewBtn active={graphView === 'network'} onClick={() => setGraphView('network')}>Network</ViewBtn>
                    <ViewBtn active={graphView === 'list'} onClick={() => setGraphView('list')}>List</ViewBtn>
                  </div>
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={graphView}
                      initial={contentStream.initial}
                      animate={contentStream.animate}
                      exit={{ opacity: 0 }}
                      transition={transitions.micro}
                    >
                      {graphView === 'neural' && (
                      <Suspense fallback={<GraphFallback />}>
                        <div className="h-[640px]">
                          <NeuralNavigator
                            nodes={displayNodes}
                            edges={graph.edges}
                            segments={displaySegments}
                            onSeek={handleSeek}
                          />
                        </div>
                      </Suspense>
                    )}
                    {graphView === 'tree' && (
                        <Suspense fallback={<GraphFallback />}>
                          <TopicTree graphNodes={displayNodes} graphEdges={graph.edges} onSeek={handleSeek} />
                        </Suspense>
                      )}
                      {graphView === 'network' && (
                        <Suspense fallback={<GraphFallback />}>
                          <KnowledgeGraph graphNodes={displayNodes} graphEdges={graph.edges} onSeek={handleSeek} />
                        </Suspense>
                      )}
                      {graphView === 'list' && (
                        <div className="space-y-8">
                          {topics.length > 0 && (
                            <section>
                              <h3 className="mb-3 font-semibold text-stone-800 dark:text-stone-200">Topics</h3>
                              <motion.div className="grid grid-cols-1 sm:grid-cols-2 gap-3" initial="initial" animate="animate" variants={staggerContainer()}>
                                {topics.map((node) => (
                                  <motion.div key={node.id} variants={staggerItem()} className={`shine-card rounded-2xl p-3 cursor-pointer ${tw.surface} ${tw.surfaceHover}`} onClick={() => node.timestampRef != null && handleSeek(node.timestampRef)}>
                                    <p className="text-sm font-medium dark:text-stone-100">{node.label}</p>
                                    {node.timestampRef != null && <p className="mt-1 text-xs text-gray-400 dark:text-stone-500">{formatTime(node.timestampRef)}</p>}
                                  </motion.div>
                                ))}
                              </motion.div>
                            </section>
                          )}
                          {entities.length > 0 && (
                            <section>
                              <h3 className="mb-3 font-semibold text-stone-800 dark:text-stone-200">Entities</h3>
                              <motion.div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" initial="initial" animate="animate" variants={staggerContainer()}>
                                {entities.map((node) => {
                                  const et = (node.metadata?.entityType as string) || ''
                                  return (
                                    <motion.div key={node.id} variants={staggerItem()} className={`shine-card rounded-2xl p-3 flex items-center gap-3 cursor-pointer ${tw.surface} ${tw.surfaceHover}`} onClick={() => node.timestampRef != null && handleSeek(node.timestampRef)}>
                                      <span className="text-lg">{ENTITY_ICONS[et] || '🏷️'}</span>
                                      <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium truncate dark:text-stone-100">{node.label}</p>
                                        <p className="text-xs text-gray-400 dark:text-stone-500">{et}</p>
                                      </div>
                                      {node.timestampRef != null && <span className="font-mono text-xs text-gray-400 dark:text-stone-500">{formatTime(node.timestampRef)}</span>}
                                    </motion.div>
                                  )
                                })}
                              </motion.div>
                            </section>
                          )}
                          {keywords.length > 0 && (
                            <section>
                              <h3 className="mb-3 font-semibold text-stone-800 dark:text-stone-200">Key Terms</h3>
                              <div className="flex flex-wrap gap-2">
                                {keywords.map((node) => (
                                  <span key={node.id} className="rounded-full border border-stone-200 bg-gray-100 px-3 py-1 text-sm text-gray-700 cursor-pointer transition-colors duration-150 ease-out hover:border-[#FF6B35]/50 hover:bg-[#FF6B35]/10 dark:border-white/10 dark:bg-stone-800 dark:text-stone-300 dark:hover:border-[#D946EF]/40 dark:hover:bg-[#D946EF]/10"
                                    onClick={() => node.timestampRef != null && handleSeek(node.timestampRef)}>{node.label}</span>
                                ))}
                              </div>
                            </section>
                          )}
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>
              ) : video.status === 'done' ? (
                <div className="rounded-3xl border border-dashed border-[#FF6B35]/40 bg-white/65 py-16 text-center text-stone-500 backdrop-blur-xl dark:border-[#D946EF]/40 dark:bg-stone-900/50 dark:text-stone-400">Analysis will appear once processing is complete.</div>
              ) : (
                <OutputSkeleton lines={3} />
              ))}

              {mainTab === 'generate' && <GeneratePanel videoId={id!} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  )
}

// ─── Processing pipeline ─────────────────────────────────────────────

const PIPELINE = [
  { key: 'ingest', label: 'Ingest' },
  { key: 'transcribe', label: 'Transcribe' },
  { key: 'diarize', label: 'Diarize' },
  { key: 'graph', label: 'Knowledge Graph' },
  { key: 'summarize', label: 'Summarize' },
] as const

// Index of the active pipeline step for each backend status.
const STATUS_STEP: Record<string, number> = {
  queued: 0,
  downloading: 0,
  processing: 1,
  analyzing: 3,
  done: 4,
  failed: 1,
}

type StepState = 'done' | 'active' | 'pending' | 'failed'

function PipelineStepper({
  status,
  onRetry,
  retrying,
  errorMessage,
  duration,
}: {
  status: Video['status']
  onRetry: () => void
  retrying: boolean
  errorMessage?: string
  duration: number
}) {
  const failed = status === 'failed'
  const done = status === 'done'
  const idx = STATUS_STEP[status] ?? 0

  const stateFor = (i: number): StepState => {
    if (done) return 'done'
    if (failed) {
      if (i < idx) return 'done'
      if (i === idx) return 'failed'
      return 'pending'
    }
    if (i < idx) return 'done'
    if (i === idx) return 'active'
    return 'pending'
  }
  const connectorState = (i: number): 'done' | 'active' | 'pending' => {
    const next = stateFor(i + 1)
    if (next === 'done') return 'done'
    if (next === 'active' || stateFor(i) === 'active') return 'active'
    return 'pending'
  }

  return (
    <div
      className={`rounded-3xl border p-5 backdrop-blur-xl transition-colors ${
        failed
          ? 'border-red-500/40 bg-red-500/[0.04] shadow-[0_0_60px_rgb(239_68_68/0.16)] dark:border-red-500/30 dark:bg-red-500/[0.05]'
          : 'border-black/10 bg-white/70 dark:border-white/10 dark:bg-white/[0.03]'
      }`}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-400 dark:text-[#737373]">
          Processing pipeline
        </p>
        <StatusChip status={status} duration={duration} />
      </div>

      <ol className="flex items-center gap-1 sm:gap-2">
        {PIPELINE.map((step, i) => (
          <li
            key={step.key}
            aria-label={step.label}
            className={`flex items-center gap-1 sm:gap-2 ${i < PIPELINE.length - 1 ? 'flex-1' : ''}`}
          >
            <StepNode state={stateFor(i)} index={i} label={step.label} />
            {i < PIPELINE.length - 1 && <Connector state={connectorState(i)} />}
          </li>
        ))}
      </ol>

      <AnimatePresence>
        {failed && (
          <motion.div
            key="retry"
            role="alert"
            className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={transitions.contentIn}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="shrink-0 text-red-400">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 7.5v6M12 16.5v.5" strokeLinecap="round" />
            </svg>
            <span className="min-w-0 flex-1 text-red-700 dark:text-red-300">{errorMessage || 'Processing failed'}</span>
            <button
              type="button"
              onClick={onRetry}
              disabled={retrying}
              className="shrink-0 rounded-xl bg-red-600 px-3.5 py-1.5 font-semibold text-white shadow-[0_6px_20px_rgb(239_68_68/0.35)] transition-all duration-200 hover:bg-red-500 disabled:cursor-wait disabled:opacity-60"
            >
              {retrying ? 'Retrying…' : 'Retry Invocation'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function StepNode({ state, index, label }: { state: StepState; index: number; label: string }) {
  const reduced = usePrefersReducedMotion()
  if (state === 'done') {
    return (
      <span className="flex items-center gap-2">
        <motion.span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-500 text-white shadow-[0_0_16px_rgb(16_185_129/0.5)]"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={transitions.contentIn}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
        </motion.span>
        <span className="hidden text-xs font-semibold text-emerald-600 sm:block dark:text-emerald-400">{label}</span>
      </span>
    )
  }
  if (state === 'active') {
    return (
      <span className="flex items-center gap-2">
        <span className="relative grid h-7 w-7 shrink-0 place-items-center">
          <span className="spin-ring absolute inset-0" />
          <motion.span
            className="h-3.5 w-3.5 rounded-full bg-gradient-to-br from-[#FF6B35] to-[#D946EF] shadow-[0_0_16px_rgb(217_70_239/0.7)]"
            animate={reduced ? {} : { scale: [1, 1.18, 1] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
          />
        </span>
        <motion.span
          className="hidden text-xs font-semibold text-[#EA580C] sm:block dark:text-[#FF8A5C]"
          animate={reduced ? {} : { opacity: [1, 0.55, 1] }}
          transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
        >
          {label}
        </motion.span>
      </span>
    )
  }
  if (state === 'failed') {
    return (
      <span className="flex items-center gap-2">
        <motion.span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-red-500 text-white shadow-[0_0_16px_rgb(239_68_68/0.6)]"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={transitions.contentIn}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </motion.span>
        <span className="hidden text-xs font-semibold text-red-600 sm:block dark:text-red-400">{label}</span>
      </span>
    )
  }
  return (
    <span className="flex items-center gap-2">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-black/10 bg-white/60 text-xs font-semibold text-stone-400 dark:border-white/15 dark:bg-white/[0.03] dark:text-stone-500">
        {index + 1}
      </span>
      <span className="hidden text-xs font-medium text-stone-400 sm:block dark:text-stone-500">{label}</span>
    </span>
  )
}

function Connector({ state }: { state: 'done' | 'active' | 'pending' }) {
  const cls =
    state === 'done'
      ? 'bg-emerald-500/60'
      : state === 'active'
        ? 'bg-gradient-to-r from-[#FF6B35]/60 to-[#D946EF]/60'
        : 'bg-black/10 dark:bg-white/10'
  return <span className={`h-0.5 min-w-3 flex-1 rounded-full ${cls}`} />
}

function StatusChip({ status, duration }: { status: string; duration: number }) {
  const processing = isProcessing(status as Video['status'])
  return (
    <span className="flex items-center gap-2 text-xs">
      <span className={`w-2 h-2 rounded-full ${STATUS_DOT_COLORS[status] || 'bg-gray-300'} ${processing ? 'animate-pulse' : ''}`} />
      <span className="font-semibold capitalize text-stone-700 dark:text-stone-200">{status}</span>
      {duration > 0 && <span className="font-mono text-stone-400 dark:text-stone-500">{formatTime(duration)}</span>}
    </span>
  )
}

function Chip({ tone = 'default', children }: { tone?: 'default' | 'tangerine' | 'orchid'; children: React.ReactNode }) {
  const cls = {
    default: 'border-black/10 bg-white/70 text-stone-600 dark:border-white/15 dark:bg-white/[0.04] dark:text-stone-300',
    tangerine: 'border-[#FF6B35]/40 bg-[#FF6B35]/10 text-[#C2410C] dark:border-[#FF6B35]/35 dark:bg-[#FF6B35]/[0.08] dark:text-[#FF8A5C]',
    orchid: 'border-[#D946EF]/40 bg-[#D946EF]/10 text-[#A21CAF] dark:border-[#D946EF]/35 dark:bg-[#D946EF]/[0.08] dark:text-[#E879F9]',
  }[tone]
  return (
    <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold backdrop-blur-md ${cls}`}>
      {children}
    </span>
  )
}

// ─── Loading skeleton ────────────────────────────────────────────────

function WorkspaceSkeleton() {
  return (
    <div className="min-h-screen bg-[#FAFAFA] dark:bg-[#0A0A0A]">
      <header className="border-b border-black/10 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-[#0A0A0A]/80">
        <div className="mx-auto max-w-5xl px-4 py-3">
          <div className="h-6 w-48 rounded skeleton-shimmer" />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8" aria-hidden="true">
        <div className="aspect-video rounded-3xl skeleton-shimmer" />
        <div className="mt-5 h-8 w-72 rounded skeleton-shimmer" />
        <div className="mt-4 h-28 rounded-3xl skeleton-shimmer" />
        <div className="mt-6 flex gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 w-28 rounded-xl skeleton-shimmer" />
          ))}
        </div>
        <div className="mt-6 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="rounded-2xl border border-black/10 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="mb-2 h-3 w-16 rounded skeleton-shimmer" />
              <div className={`h-3 rounded skeleton-shimmer ${i % 3 === 0 ? 'w-3/4' : i % 3 === 1 ? 'w-full' : 'w-5/6'}`} />
              <div className={`mt-2 h-3 rounded skeleton-shimmer ${i % 2 === 0 ? 'w-11/12' : 'w-2/3'}`} />
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}

function OutputSkeleton({ lines = 5 }: { lines?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-black/10 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="mb-2 flex items-center gap-2">
            <div className="h-4 w-14 rounded-full skeleton-shimmer" />
            <div className="h-3 w-20 rounded skeleton-shimmer" />
          </div>
          <div className={`h-3 rounded skeleton-shimmer ${i % 3 === 0 ? 'w-3/4' : i % 3 === 1 ? 'w-full' : 'w-5/6'}`} />
          <div className={`mt-2 h-3 rounded skeleton-shimmer ${i % 2 === 0 ? 'w-11/12' : 'w-2/3'}`} />
        </div>
      ))}
    </div>
  )
}

function GraphFallback() {
  const nodes = [
    { top: '18%', left: '22%', size: 34 },
    { top: '55%', left: '12%', size: 26 },
    { top: '30%', left: '58%', size: 42 },
    { top: '70%', left: '48%', size: 22 },
    { top: '12%', left: '80%', size: 26 },
    { top: '62%', left: '78%', size: 34 },
    { top: '42%', left: '90%', size: 22 },
  ]
  return (
    <div style={{ height: 500 }} className="relative overflow-hidden rounded-2xl border border-black/10 bg-white/70 dark:border-white/10 dark:bg-stone-950/60">
      {nodes.map((n, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-[#D946EF]/40 animate-pulse dark:bg-[#D946EF]/30"
          style={{ top: n.top, left: n.left, width: n.size, height: n.size, animationDelay: `${i * 160}ms` }}
        />
      ))}
      {[0, 1, 2].map((i) => (
        <span
          key={`line-${i}`}
          className="absolute h-px bg-[#FF6B35]/30"
          style={{ top: `${30 + i * 16}%`, left: '35%', width: `${38 + i * 4}%`, transform: `rotate(${i * 18}deg)` }}
        />
      ))}
    </div>
  )
}

const STATUS_DOT_COLORS: Record<string, string> = {
  queued: 'bg-yellow-400',
  downloading: 'bg-amber-400',
  processing: 'bg-orange-400',
  analyzing: 'bg-rose-400',
  done: 'bg-green-400',
  failed: 'bg-red-400',
}

// ─── Generate panel ───────────────────────────────────────────────

function GeneratePanel({ videoId }: { videoId: string }) {
  const [generating, setGenerating] = useState<string | null>(null)
  const [contentMap, setContentMap] = useState<Record<string, GeneratedContent>>({})
  const [chatInput, setChatInput] = useState('')
  const [chatHistory, setChatHistory] = useState<{ q: string; a: string }[]>([])
  const [chatLoading, setChatLoading] = useState(false)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  useEffect(() => {
    const el = chatScrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [chatHistory.length, chatLoading])

  const handleGenerate = async (type: 'summary' | 'notes' | 'quiz') => {
    setGenerating(type)
    try {
      const result = await generateContent(videoId, type)
      setContentMap((prev) => ({ ...prev, [type]: result }))
      toast(`${type[0].toUpperCase()}${type.slice(1)} generated`, 'success')
    } catch {
      toast(`Failed to generate ${type}`, 'error')
    } finally {
      setGenerating(null)
    }
  }

  const handleAsk = async () => {
    if (!chatInput.trim()) return
    const q = chatInput.trim()
    setChatInput('')
    setChatLoading(true)
    try {
      const res = await askQuestion(videoId, q)
      setChatHistory((prev) => [...prev, { q, a: res.answer }])
    } catch {
      setChatHistory((prev) => [...prev, { q, a: 'Failed to get answer.' }])
    } finally {
      setChatLoading(false)
    }
  }

  const handleExport = async (format: 'markdown' | 'json') => {
    try {
      const data = await exportVideo(videoId, format)
      const blob = new Blob(
        [typeof data === 'string' ? data : JSON.stringify(data, null, 2)],
        { type: format === 'json' ? 'application/json' : 'text/markdown' }
      )
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `knovid-${videoId.slice(-8)}.${format === 'json' ? 'json' : 'md'}`
      a.click()
      URL.revokeObjectURL(url)
      toast(`Exported as ${format.toUpperCase()}`, 'success')
    } catch {
      toast('Export failed', 'error')
    }
  }

  const renderContent = (text: string) => {
    return text.split('\n').map((line, i) => {
      const body = line.startsWith('# ')
        ? <h1 className="mt-4 mb-2 text-xl font-bold text-stone-900 dark:text-stone-50">{line.slice(2)}</h1>
        : line.startsWith('## ')
          ? <h2 className="mt-3 mb-1 text-lg font-semibold text-stone-900 dark:text-stone-100">{line.slice(3)}</h2>
          : line.startsWith('### ')
            ? <h3 className="mt-2 mb-1 text-base font-medium text-stone-900 dark:text-stone-200">{line.slice(4)}</h3>
            : line.startsWith('- ')
              ? <li className="ml-4 list-disc text-sm text-gray-700 dark:text-stone-300">{line.slice(2)}</li>
              : line.startsWith('---')
                ? <hr className="my-3 border-gray-200 dark:border-white/10" />
                : line.trim() === ''
                  ? <div className="h-2" />
                  : <p className="text-sm text-gray-700 dark:text-stone-300">{line}</p>

      return (
        <motion.div key={i} variants={staggerItem(materialize)}>
          {body}
        </motion.div>
      )
    })
  }

  const types = [
    { key: 'summary' as const, label: 'Summary', desc: 'Concise overview', icon: 'S', color: 'from-[#FF6B35] to-[#FF9A3D]' },
    { key: 'notes' as const, label: 'Study Notes', desc: 'Structured key points', icon: 'N', color: 'from-[#D946EF] to-[#A855F7]' },
    { key: 'quiz' as const, label: 'Quiz', desc: 'Test your knowledge', icon: 'Q', color: 'from-[#FF9A3D] to-[#D946EF]' },
  ]

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 font-semibold text-stone-800 dark:text-stone-200">Generate Content</h2>
        <div className="flex flex-col gap-3 sm:flex-row">
          {types.map((t) => (
            <button
              key={t.key}
              onClick={() => handleGenerate(t.key)}
              disabled={generating !== null}
              className={`shine-card flex-1 rounded-2xl p-4 text-left disabled:opacity-50 disabled:active:scale-100 ${tw.surface} ${tw.surfaceHover} active:scale-[0.99]`}
            >
              <div className="mb-3 flex items-center gap-3">
                <span className={`grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br ${t.color} font-display text-xs font-black text-white shadow-sm`}>{t.icon}</span>
                <div>
                  <p className="font-display text-sm font-bold text-stone-900 dark:text-stone-100">{t.label}</p>
                  <p className="mt-0.5 text-xs text-stone-400">{t.desc}</p>
                </div>
              </div>
              {generating === t.key && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-[#EA580C] dark:text-[#FF8A5C]">
                  <Spinner /> Generating…
                </p>
              )}
            </button>
          ))}
        </div>
        <AnimatePresence>
          {Object.entries(contentMap).map(([type, c]) => (
            <motion.div
              key={type}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={transitions.contentIn}
              className={`mt-4 rounded-2xl p-4 ${tw.surface}`}
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded-full border border-[#FF6B35]/40 bg-[#FF6B35]/10 px-2 py-0.5 text-xs font-medium uppercase text-[#C2410C] dark:border-[#FF6B35]/30 dark:bg-[#FF6B35]/[0.08] dark:text-[#FF8A5C]">{type}</span>
              </div>
              <motion.div className="prose prose-sm max-w-none dark:prose-invert" initial="initial" animate="animate" variants={staggerContainer({ delay: 0.1 })}>
                {renderContent(c.content)}
              </motion.div>
            </motion.div>
          ))}
        </AnimatePresence>
      </section>

      <section className="border-t pt-6 dark:border-white/10">
        <h2 className="mb-3 font-semibold text-stone-800 dark:text-stone-200">Ask the Video</h2>
        <div ref={chatScrollRef} className={`mb-3 flex max-h-72 flex-col gap-3 overflow-y-auto rounded-2xl p-4 ${tw.surface}`}>
          {chatHistory.length === 0 && <p className="text-sm text-gray-400 dark:text-stone-500">Ask a question about this video.</p>}
          {chatHistory.map((item, i) => (
            <Fragment key={i}>
              <motion.div
                initial={chatBubble('user').initial}
                animate={chatBubble('user').animate}
                transition={transitions.contentIn}
                className="ml-auto max-w-[85%] self-end rounded-2xl bg-[#FF6B35] px-3 py-2 text-sm text-white shadow-[0_4px_16px_rgb(255_107_53/0.3)]"
              >
                {item.q}
              </motion.div>
              <motion.div
                initial={chatBubble('assistant').initial}
                animate={chatBubble('assistant').animate}
                transition={transitions.contentIn}
                className="self-start max-w-[85%] whitespace-pre-wrap rounded-2xl bg-stone-100 px-3 py-2 text-sm text-stone-800 dark:bg-stone-800 dark:text-stone-200"
              >
                <Typewriter text={item.a} />
              </motion.div>
            </Fragment>
          ))}
          {chatLoading && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={transitions.contentIn}
              className="self-start inline-flex items-center gap-1.5 rounded-2xl bg-stone-100 px-3 py-2 text-[#A21CAF] dark:bg-stone-800 dark:text-[#E879F9]"
            >
              <TypingDots />
              <span className="text-xs">Thinking…</span>
            </motion.div>
          )}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Ask a question..."
            className={`flex-1 rounded-xl px-3.5 py-2.5 text-sm ${tw.input}`}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
          />
          <button
            onClick={handleAsk}
            disabled={chatLoading}
            className="btn-ember rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Ask
          </button>
        </div>
      </section>

      <section className="border-t pt-6 dark:border-white/10">
        <h2 className="mb-3 font-semibold text-stone-800 dark:text-stone-200">Export</h2>
        <div className="flex gap-3">
          <button onClick={() => handleExport('markdown')} className={`shine-card rounded-xl px-4 py-2 text-sm ${tw.surface} ${tw.surfaceHover}`}>Markdown</button>
          <button onClick={() => handleExport('json')} className={`shine-card rounded-xl px-4 py-2 text-sm ${tw.surface} ${tw.surfaceHover}`}>JSON</button>
        </div>
      </section>
    </div>
  )
}

function Spinner() {
  return <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
}

// Word-by-word streaming for AI chat replies.
function Typewriter({ text, speed = 24 }: { text: string; speed?: number }) {
  const [words, setWords] = useState('')
  const [done, setDone] = useState(false)
  useEffect(() => {
    let i = 0
    setWords('')
    setDone(false)
    const parts = text.split(' ')
    const id = window.setInterval(() => {
      i += 1
      setWords(parts.slice(0, i).join(' '))
      if (i >= parts.length) {
        window.clearInterval(id)
        setDone(true)
      }
    }, speed)
    return () => window.clearInterval(id)
  }, [text, speed])
  return (
    <>
      {words}
      {!done && <span className="ml-0.5 inline-block animate-pulse">▍</span>}
    </>
  )
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <span key={i} className="typing-dot h-1.5 w-1.5 rounded-full bg-current" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  )
}

function TabBtn({ active, onClick, children, disabled = false }: { active: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 ease-out ${
        disabled
          ? 'cursor-not-allowed text-stone-300 dark:text-stone-600'
          : active
            ? 'bg-gradient-to-r from-[#FF6B35] to-[#D946EF] text-white shadow-[0_6px_20px_rgb(217_70_239/0.35)]'
            : 'text-stone-500 hover:bg-white/80 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800/70 dark:hover:text-stone-100'
      }`}
    >
      {children}
    </button>
  )
}

function ViewBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl px-3 py-1.5 text-sm font-medium transition-all duration-200 ease-out ${
        active
          ? 'bg-gradient-to-r from-[#FF6B35] to-[#D946EF] text-white shadow-[0_4px_16px_rgb(217_70_239/0.3)]'
          : 'text-stone-500 hover:bg-white/80 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800/70 dark:hover:text-stone-100'
      }`}
    >
      {children}
    </button>
  )
}
