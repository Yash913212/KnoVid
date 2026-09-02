import { useState, useEffect, useRef, useCallback, Fragment, lazy, Suspense } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { AnimatePresence, animate, motion } from 'motion/react'
import { uploadVideo, submitUrl, getVideos, retryVideo, STATUS_LABELS, STATUS_PROGRESS, getStatusStep, isProcessing, type Video, type VideoStatus } from '../api/videos'
import { fadeUpLift, scaleFade, tw, staggerContainer, staggerItem, transitions } from '../lib/motion'
import { useToast } from '../components/Toast'
import Magnetic from '../components/Magnetic'
import { formatTime, errorMessage } from '../utils'
import { getResume } from '../lib/resume'
import { FileText, Sparkles } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Segmented } from '../components/ui/Segmented'
import { Skeleton } from '../components/ui/Skeleton'

const FeatureShowcase = lazy(() => import('../components/FeatureShowcase'))

const POLL_INTERVAL = 3000

const TRANSCRIPT_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'hi', label: 'Hindi' },
  { code: 'te', label: 'Telugu' },
  { code: 'ta', label: 'Tamil' },
  { code: 'bn', label: 'Bengali' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ar', label: 'Arabic' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
]

const HERO_WORDS: { t: string; accent?: boolean }[] = [
  { t: 'Turn' },
  { t: 'every' },
  { t: 'video' },
  { t: 'into' },
  { t: 'a' },
  { t: 'thinking', accent: true },
  { t: 'space.', accent: true },
]

const SOURCES = ['YouTube', 'Vimeo', 'X / Twitter', 'TikTok', 'Podcasts', 'Direct MP4']

const PIPELINE = [
  { label: 'Transcribe', desc: 'Speech → text in any language', color: 'from-[#2BA6A0] to-[#D4A34A]', glow: 'text-[#73CEC2]', Icon: IconMic },
  { label: 'Diarize', desc: 'Separate speakers & roles', color: 'from-[#73CEC2] to-[#B75B6A]', glow: 'text-[#E3C4FF]', Icon: IconUsers },
  { label: 'Graph', desc: 'Map concepts & connections', color: 'from-[#C17EF9] to-[#C08BF0]', glow: 'text-[#E3C4FF]', Icon: IconGraph },
  { label: 'Generate', desc: 'Notes, quizzes & Q&A', color: 'from-[#2BA6A0] to-[#C17EF9]', glow: 'text-[#E3C4FF]', Icon: IconSparkles },
]

type FlowState = 'idle' | 'active' | 'done'

// Derive the 4-stage pipeline state from the furthest-along live import.
// Statuses: queued(0) → downloading(1) → transcribing(2) → analyzing(3) → done(4).
function deriveFlow(activeMax: number, hasDone: boolean): FlowState[] {
  const s: FlowState[] = ['idle', 'idle', 'idle', 'idle']
  if (activeMax >= 0) {
    const ai = Math.min(3, Math.max(0, activeMax <= 1 ? 0 : activeMax - 1))
    for (let i = 0; i < 4; i++) s[i] = i < ai ? 'done' : i === ai ? 'active' : 'idle'
  } else if (hasDone) {
    s[0] = 'done'; s[1] = 'done'; s[2] = 'done'; s[3] = 'done'
  } else {
    s[0] = 'active'
  }
  return s
}

export default function Dashboard() {
    const navigate = useNavigate()
  const location = useLocation()
  const { toast } = useToast()
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [url, setUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [transmuting, setTransmuting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'url' | 'upload'>('all')
  const [outputLang, setOutputLang] = useState('en')
  const [recentUpload, setRecentUpload] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollingInFlight = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const urlInputRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)

  const loadVideos = useCallback(async () => {
    try {
      const data = await getVideos()
      setVideos(data)
      return data
    } catch {
      return null
    }
  }, [])

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  // Single polling loop shared by the mount effect and upload/retry handlers.
  // Guards against overlapping requests when a fetch takes longer than the
  // interval, and stops itself once nothing is processing.
  const tick = useCallback(async () => {
    if (pollingInFlight.current) return
    pollingInFlight.current = true
    try {
      const data = await loadVideos()
      if (!data || !data.some((v) => isProcessing(v.status))) stopPolling()
    } finally {
      pollingInFlight.current = false
    }
  }, [loadVideos, stopPolling])

  const startPollIfNeeded = useCallback((data: Video[] | null) => {
    if (data?.some((v) => isProcessing(v.status))) {
      if (!pollRef.current) pollRef.current = setInterval(tick, POLL_INTERVAL)
    }
  }, [tick])

  useEffect(() => {
    loadVideos()
      .finally(() => setLoading(false))
      .then(startPollIfNeeded)
    return stopPolling
  }, [loadVideos, startPollIfNeeded, stopPolling])

  // Revert the portal to idle once the just-imported video finishes (or fails).
  useEffect(() => {
    if (!recentUpload) return
    const rv = videos.find((v) => v._id === recentUpload)
    if (rv && !isProcessing(rv.status)) setRecentUpload(null)
  }, [recentUpload, videos])

  const recentVideo = recentUpload ? videos.find((v) => v._id === recentUpload) : null
  const portalProcessing = !!recentVideo && isProcessing(recentVideo.status)

  const handleFile = async (file: File) => {
    setUploading(true)
    setUploadProgress(0)
    setError('')
    try {
      const { id } = await uploadVideo(file, setUploadProgress, outputLang)
      toast(`Upload started: ${file.name}`, 'success')
      const data = await loadVideos()
      if (data) {
        setRecentUpload(id)
        startPollIfNeeded(data)
      }
    } catch (err) {
      setError(errorMessage(err, 'Upload failed. Check file size and format.'))
      toast('Upload failed', 'error')
    } finally {
      setUploading(false)
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) await handleFile(file)
    e.target.value = ''
  }

  const handleUrl = async () => {
    if (!url.trim()) return
    setError('')
    setTransmuting(true)
    try {
      const { id } = await submitUrl(url.trim(), outputLang)
      toast('URL added — transmuting started', 'success')
      setUrl('')
      const data = await loadVideos()
      if (data) {
        setRecentUpload(id)
        startPollIfNeeded(data)
      }
    } catch (err) {
      setError(errorMessage(err, 'Failed to submit URL'))
      toast('Failed to submit URL', 'error')
    } finally {
      setTransmuting(false)
    }
  }

  const handleRetry = async (id: string) => {
    try {
      await retryVideo(id)
      toast('Re-invoking the pipeline…', 'info')
      const data = await loadVideos()
      if (data) startPollIfNeeded(data)
    } catch {
      toast('Retry failed', 'error')
    }
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    dragDepth.current++
    setDragOver(true)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    dragDepth.current--
    if (dragDepth.current <= 0) {
      dragDepth.current = 0
      setDragOver(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragDepth.current = 0
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const focusPortal = () => {
    document.getElementById('portal')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setTimeout(() => urlInputRef.current?.focus(), 650)
  }

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Deep-link navigation from the shared AppShell command bar. When the shell
  // routes us to /#portal or /#library, settle on that section and (for the
  // portal) focus the URL input.
  useEffect(() => {
    const hash = location.hash
    if (!hash) return
    const id = hash.slice(1)
    const el = document.getElementById(id)
    if (!el) return
    const raf = requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      if (id === 'portal') urlInputRef.current?.focus()
    })
    return () => cancelAnimationFrame(raf)
  }, [location.hash])

  const activeVideos = videos.filter((v) => isProcessing(v.status))
  const doneVideos = videos.filter((v) => v.status === 'done' || v.status === 'failed')
  const mappedVideos = doneVideos.filter((v) => v.status === 'done')
  const displayVideos = doneVideos
    .filter((v) => v.originalName.toLowerCase().includes(query.trim().toLowerCase()))
    .filter((v) => sourceFilter === 'all' || v.source === sourceFilter)
  const transcriptMinutes = Math.round(mappedVideos.reduce((sum, v) => sum + v.duration, 0) / 60)
  const isEmpty = !loading && videos.length === 0
  const noSuccessful = !loading && !doneVideos.some((v) => v.status === 'done')

  const activeMax = activeVideos.reduce((m, v) => Math.max(m, getStatusStep(v.status)), -1)
  const flowStates = deriveFlow(activeMax, doneVideos.some((v) => v.status === 'done'))

  return (
    <div className="workspace-page dashboard-page">
      {isEmpty ? (
          <>
            <OnboardingHero onSummon={focusPortal} onHow={() => scrollTo('pipeline')} />
            <MagicUploadPortal
              fileInputRef={fileInputRef}
              urlInputRef={urlInputRef}
              uploading={uploading}
              uploadProgress={uploadProgress}
              processing={portalProcessing}
              processingStatus={recentVideo?.status}
              transmuting={transmuting}
              dragOver={dragOver}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onPick={() => fileInputRef.current?.click()}
              url={url}
              onUrlChange={setUrl}
              onTransmute={handleUrl}
              outputLang={outputLang}
              onLangChange={setOutputLang}
              onCancel={() => setRecentUpload(null)}
              onUploadInput={handleUpload}
              error={error}
            />
            <Suspense fallback={null}>
              <FeatureShowcase />
            </Suspense>
            <div className="mx-auto max-w-4xl px-4 pb-24">
              <ValuePipeline flowStates={flowStates} heading="How KnoVid works" />
            </div>
          </>
        ) : (
          <>
            <section id="top" className="mx-auto max-w-6xl px-4 pb-4 pt-12 sm:pt-16">
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={transitions.contentIn}
                className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end"
              >
                <div className="max-w-2xl">
                  <p className="eyebrow text-[#1D7773] dark:text-[#73CEC2]">Your knowledge engine</p>
                  <h1 className="font-display mt-2.5 text-3xl font-bold tracking-tight text-stone-950 sm:text-4xl dark:text-white">
                    Knowledge <span className="font-serif italic font-normal title-gradient">Universes</span>
                  </h1>
                  <p className="mt-2.5 text-sm leading-6 text-stone-600 dark:text-stone-400">
                    Transcripts, speakers, and graphs — query anything you've imported.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 rounded-full border border-black/[0.08] bg-white/70 px-3.5 py-2 text-sm text-stone-500 shadow-[inset_0_1px_0_rgb(255_255_255/0.6)] backdrop-blur-xl focus-within:ring-4 focus-within:ring-[#2BA6A0]/15 dark:border-white/10 dark:bg-white/[0.05] dark:text-stone-400">
                    <IconSearch className="h-4 w-4" />
                    <input
                      aria-label="Search videos"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search universes"
                      className="w-36 bg-transparent text-sm text-stone-800 outline-none placeholder:text-stone-400 sm:w-44 dark:text-stone-100 dark:placeholder:text-stone-500"
                    />
                  </label>
                  <Segmented
                    value={viewMode}
                    onChange={setViewMode}
                    layoutId="view-mode-pill"
                    options={[
                      { value: 'grid', label: <IconGrid />, title: 'Grid view' },
                      { value: 'list', label: <IconList />, title: 'List view' },
                    ]}
                  />
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...transitions.contentIn, delay: 0.08 }}
                className="mt-6 inline-grid w-full max-w-xl grid-cols-3 divide-x divide-black/[0.06] overflow-hidden rounded-2xl border border-black/[0.08] bg-white/70 shadow-[inset_0_1px_0_rgb(255_255_255/0.6)] backdrop-blur-xl dark:divide-white/10 dark:border-white/10 dark:bg-white/[0.04]"
              >
                <StatCell label="Universes" value={videos.length} accent="text-[#2BA6A0]" />
                <StatCell label="Mapped" value={mappedVideos.length} accent="text-[#C17EF9]" />
                <StatCell label="Transcript" value={transcriptMinutes} suffix="m" accent="text-stone-950 dark:text-white" />
              </motion.div>
            </section>

            <MagicUploadPortal
              fileInputRef={fileInputRef}
              urlInputRef={urlInputRef}
              uploading={uploading}
              uploadProgress={uploadProgress}
              processing={portalProcessing}
              processingStatus={recentVideo?.status}
              transmuting={transmuting}
              dragOver={dragOver}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onPick={() => fileInputRef.current?.click()}
              url={url}
              onUrlChange={setUrl}
              onTransmute={handleUrl}
              outputLang={outputLang}
              onLangChange={setOutputLang}
              onCancel={() => setRecentUpload(null)}
              onUploadInput={handleUpload}
              error={error}
            />

            {noSuccessful && (
              <Suspense fallback={null}>
                <FeatureShowcase />
              </Suspense>
            )}

            <div id="pipeline" className="mx-auto max-w-6xl px-4 pb-10">
              <ValuePipeline flowStates={flowStates} />
            </div>

            {activeVideos.length > 0 && (
              <motion.section
                className="mx-auto max-w-6xl px-4 pb-10"
                initial="hidden"
                animate="show"
                variants={staggerContainer()}
              >
                <div className="overflow-hidden rounded-3xl border border-black/[0.08] bg-white/70 shadow-[inset_0_1px_0_rgb(255_255_255/0.6)] backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.04]">
                  <div className="flex items-center justify-between border-b border-black/[0.05] px-4 py-3 sm:px-5 dark:border-white/5">
                    <div className="flex items-center gap-2.5">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#2BA6A0] opacity-70" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-[#2BA6A0]" />
                      </span>
                      <h2 className="font-display text-sm font-bold text-stone-900 dark:text-stone-50">
                        Now <span className="font-serif italic font-normal title-gradient">processing</span>
                      </h2>
                    </div>
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">Awakening AI…</span>
                  </div>
                  <div className="divide-y divide-black/[0.05] dark:divide-white/5">
                    <AnimatePresence mode="popLayout">
                      {activeVideos.map((v) => (
                        <ProcessingRow key={v._id} video={v} onClick={() => navigate(`/video/${v._id}`)} />
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.section>
            )}

            <section id="library" className="mx-auto max-w-6xl px-4 pb-24 pt-2">
              <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                <div>
                  <p className="eyebrow text-[#7E3AF2] dark:text-[#E3C4FF]">Knowledge universe</p>
                  <h2 className="font-display mt-1.5 text-2xl font-bold text-stone-950 dark:text-stone-50">
                    Imported <span className="font-serif italic font-normal title-gradient">sources</span>
                  </h2>
                </div>
                <div className="flex gap-1.5">
                  <Segmented
                    value={sourceFilter}
                    onChange={setSourceFilter}
                    layoutId="source-filter-pill"
                    size="sm"
                    options={[
                      { value: 'all', label: 'All' },
                      { value: 'url', label: 'URLs' },
                      { value: 'upload', label: 'Uploads' },
                    ]}
                  />
                </div>
              </div>

              {loading ? (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="overflow-hidden rounded-3xl border border-black/[0.06] bg-white/75 backdrop-blur-xl shadow-panel dark:border-white/10 dark:bg-white/[0.03]">
                      <Skeleton className="aspect-video w-full" />
                      <div className="space-y-2 p-4">
                        <Skeleton className="h-4 w-2/3" />
                        <Skeleton className="h-3 w-1/3" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : displayVideos.length === 0 ? (
                <motion.div
                  className="rounded-3xl border border-dashed border-black/15 bg-white/50 px-6 py-14 text-center backdrop-blur-xl dark:border-white/15 dark:bg-white/[0.02]"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={transitions.contentIn}
                >
                  <p className="text-sm text-stone-500 dark:text-stone-400">
                    {doneVideos.length === 0
                      ? 'Nothing mapped yet.'
                      : query.trim()
                        ? `No universes match "${query}".`
                        : sourceFilter !== 'all'
                          ? 'No sources of that type yet.'
                          : 'Nothing to show.'}
                  </p>
                  <Button
                    onClick={focusPortal}
                    className="mt-4"
                    icon={<IconSparkles className="h-4 w-4" />}
                  >
                    Summon knowledge
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  className={viewMode === 'list' ? 'flex flex-col gap-3' : 'grid gap-5 sm:grid-cols-2 lg:grid-cols-3'}
                  initial="hidden"
                  animate="show"
                  variants={staggerContainer({ delay: 0.06 })}
                >
                  <AnimatePresence mode="popLayout">
                    {displayVideos.map((v) =>
                      viewMode === 'list' ? (
                        <KnowledgeRow key={v._id} video={v} onClick={() => navigate(`/video/${v._id}`)} onRetry={handleRetry} />
                      ) : (
                        <KnowledgeCard key={v._id} video={v} onClick={() => navigate(`/video/${v._id}`)} onRetry={handleRetry} />
                      )
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </section>
          </>
        )}
    </div>
  )
}

/* ─── Onboarding hero (empty state) ──────────────────────────────────── */

function OnboardingHero({ onSummon, onHow }: { onSummon: () => void; onHow: () => void }) {
  return (
    <section className="relative mx-auto max-w-4xl px-4 pb-6 pt-16 text-center sm:pt-24">
      <GraphConstellation />
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...transitions.contentIn, delay: 0.05 }}
        className="font-mono text-[10px] font-medium uppercase tracking-[0.3em] text-[#1D7773] dark:text-[#73CEC2]"
      >
        AI video intelligence workspace
      </motion.p>      <RevealHeading />
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...transitions.contentIn, delay: 0.45 }}
        className="mx-auto mt-4 max-w-2xl text-base leading-7 text-stone-600 sm:text-lg dark:text-stone-400"
      >
        KnoVid transcribes, maps speakers, and builds an interactive knowledge graph from your lectures and meetings. Stop scrubbing through timelines. Start querying your content.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...transitions.contentIn, delay: 0.55 }}
        className="mt-6 flex flex-wrap items-center justify-center gap-2"
      >
        <span className="eyebrow text-stone-400 dark:text-stone-500">Any source · any language</span>
        {SOURCES.map((s) => (
          <Badge key={s} className="text-[11px]">
            {s}
          </Badge>
        ))}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...transitions.contentIn, delay: 0.65 }}
        className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
      >
        <Magnetic strength={0.25}>
          <Button size="lg" onClick={onSummon} icon={<IconSparkles className="h-4 w-4" />}>
            Summon knowledge
          </Button>
        </Magnetic>
        <Button variant="secondary" size="lg" onClick={onHow} icon={<IconArrowDown className="h-4 w-4" />}>
          See how it works
        </Button>
      </motion.div>
    </section>
  )
}

function RevealHeading() {
  return (
    <motion.h1
      className="font-display mx-auto mt-4 max-w-3xl text-5xl font-bold leading-[0.98] tracking-tight text-stone-950 sm:text-6xl dark:text-white"
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.07, delayChildren: 0.15 } },
      }}
    >
      {HERO_WORDS.map((w, i) => (
        <Fragment key={w.t}>
          {i > 0 && ' '}
          <motion.span
            className={`inline-block ${w.accent ? 'font-serif italic font-normal title-gradient' : ''}`}
            variants={{
              hidden: { opacity: 0, y: 22, filter: 'blur(6px)' },
              show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
            }}
          >
            {w.t}
          </motion.span>
        </Fragment>
      ))}
    </motion.h1>
  )
}

// Decorative animated knowledge-graph mockup floating behind the hero text.
function GraphConstellation() {
  const nodes: { x: number; y: number; r: number }[] = [
    { x: 280, y: 130, r: 7 },
    { x: 186, y: 62, r: 4.5 },
    { x: 372, y: 62, r: 4.5 },
    { x: 150, y: 172, r: 3.5 },
    { x: 410, y: 172, r: 3.5 },
    { x: 216, y: 218, r: 5 },
    { x: 344, y: 218, r: 5 },
    { x: 246, y: 120, r: 3 },
    { x: 314, y: 120, r: 3 },
  ]
  const edges = [
    [0, 1], [0, 2], [0, 5], [0, 6], [1, 3], [2, 4], [1, 7], [2, 8], [5, 6], [3, 7], [4, 8],
  ]
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 grid place-items-center opacity-60 sm:opacity-80">
      <svg viewBox="0 0 560 280" className="h-auto w-full max-w-3xl" fill="none">
        <defs>
          <linearGradient id="const-edge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2BA6A0" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#C17EF9" stopOpacity="0.5" />
          </linearGradient>
        </defs>
        {edges.map(([a, b], i) => (
          <motion.line
            key={i}
            x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y}
            stroke="url(#const-edge)"
            strokeWidth="1"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1.1, delay: 0.4 + i * 0.06, ease: 'easeOut' }}
          />
        ))}
        {nodes.map((n, i) => (
          <motion.circle
            key={i}
            cx={n.x} cy={n.y} r={n.r}
            fill={i === 0 ? '#73CEC2' : '#E3C4FF'}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: i === 0 ? 0.9 : 0.55 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.25 + i * 0.06 }}
            style={{ transformOrigin: `${n.x}px ${n.y}px` }}
          />
        ))}
        <motion.circle
          cx={nodes[0].x} cy={nodes[0].y} r={26}
          fill="rgb(193 126 249 / 0.14)"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: [0.6, 1.08, 0.9], opacity: 0.8 }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          style={{ transformOrigin: `${nodes[0].x}px ${nodes[0].y}px` }}
        />
      </svg>
    </div>
  )
}

/* ─── Magic upload portal ────────────────────────────────────────────── */

interface PortalProps {
  fileInputRef: React.RefObject<HTMLInputElement | null>
  urlInputRef: React.RefObject<HTMLInputElement | null>
  uploading: boolean
  uploadProgress: number
  processing: boolean
  processingStatus?: VideoStatus
  transmuting: boolean
  dragOver: boolean
  onDragEnter: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onPick: () => void
  url: string
  onUrlChange: (v: string) => void
  onTransmute: () => void
  outputLang: string
  onLangChange: (code: string) => void
  onCancel: () => void
  onUploadInput: (e: React.ChangeEvent<HTMLInputElement>) => void
  error: string
}

function MagicUploadPortal(props: PortalProps) {
  const {
    fileInputRef, urlInputRef, uploading, uploadProgress, processing, processingStatus,
    transmuting, dragOver, onDragEnter, onDragOver, onDragLeave, onDrop, onPick,
    url, onUrlChange, onTransmute, outputLang, onLangChange, onCancel, onUploadInput, error,
  } = props

  const busy = uploading || processing || transmuting

  const handleClick = () => {
    if (busy) return
    onPick()
  }

  return (
    <section
      id="portal"
      className="relative mx-auto flex flex-col items-center px-4 pt-6 pb-12"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        onChange={onUploadInput}
        disabled={busy}
        className="sr-only"
        aria-label="Upload a video file"
      />

      <div className="relative grid place-items-center" style={{ width: 300, height: 300 }}>
        <div className={`portal-ring ${dragOver || busy ? 'portal-ring-fast' : ''} ${transmuting || uploading ? 'portal-ingest' : ''}`} />
        <motion.div
          role="button"
          tabIndex={0}
          aria-label="Summon knowledge — drop a video, paste a link, or click"
          onClick={handleClick}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !busy) {
              e.preventDefault()
              onPick()
            }
          }}
          animate={{ scale: dragOver ? 1.1 : busy ? 1.04 : 1 }}
          transition={{ type: 'spring', stiffness: 180, damping: 24 }}
          className={`portal-core relative grid aspect-square w-60 cursor-pointer place-items-center overflow-hidden rounded-full border border-white/10 bg-black/40 backdrop-blur-2xl shadow-[0_0_40px_10px_rgba(193,126,249,0.15)] transition-[box-shadow,transform,border-color] duration-500 sm:w-72 hover:shadow-[0_0_60px_15px_rgba(43,166,160,0.3)] hover:scale-[1.025] dark:border-white/10 dark:bg-[#0b0b10]/85 ${
            dragOver ? 'portal-breathe-strong' : ''
          } ${transmuting || uploading ? 'portal-ingest-disc' : ''}`}
        >
          <div className="pointer-events-none absolute inset-0 rounded-full opacity-70 dark:bg-[radial-gradient(circle_at_50%_50%,rgb(43 166 160/0.16),transparent_65%)]" />

          {uploading ? (
            <div className="flex flex-col items-center gap-2 px-6 text-center">
              <ProgressRing percent={uploadProgress} />
              <p className="font-display text-2xl font-black text-stone-900 dark:text-white">{uploadProgress}%</p>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">Transmuting into knowledge…</p>
            </div>
          ) : transmuting ? (
            <div className="flex flex-col items-center gap-2 px-6 text-center">
              <div className="relative grid h-16 w-16 place-items-center">
                <div className="spin-ring absolute inset-0 rounded-full" />
                <motion.span
                  animate={{ scale: [1, 1.14, 1], opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                  className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-[#2BA6A0] to-[#C17EF9] text-white shadow-[0_0_24px_rgb(193 126 249/0.8)]"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                </motion.span>
              </div>
              <p className="font-display text-xl font-black text-stone-900 dark:text-white">Ingesting…</p>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">Opening the link, waking Whisper…</p>
            </div>
          ) : processing && processingStatus ? (
            <div className="flex flex-col items-center gap-2 px-6 text-center">
              <div className="relative grid h-16 w-16 place-items-center">
                <div className="spin-ring absolute inset-0 rounded-full" />
                <motion.span
                  animate={{ scale: [1, 1.14, 1], opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                  className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-[#2BA6A0] to-[#C17EF9] text-white shadow-[0_0_24px_rgb(193 126 249/0.8)]"
                >
                  <IconSparkles className="h-4 w-4" />
                </motion.span>
              </div>
              <p className="font-display text-xl font-black text-stone-900 dark:text-white">Awakening AI…</p>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">{STATUS_LABELS[processingStatus]}</p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onCancel()
                }}
                className="mt-1 rounded-full border border-white/60 bg-white/60 px-3 py-1 text-[11px] font-medium text-stone-600 backdrop-blur transition-colors hover:text-[#1D7773] dark:border-white/10 dark:bg-white/[0.06] dark:text-stone-400 dark:hover:text-[#73CEC2]"
              >
                Change source
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1 px-6 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[#2BA6A0] to-[#C17EF9] text-white shadow-[0_0_34px_rgb(193 126 249/0.6)]">
                <IconSparkles className="h-7 w-7" />
              </span>
              <p className="font-display mt-2 text-xl font-black text-stone-900 dark:text-white">Summon Knowledge</p>
              <p className="text-[11px] leading-relaxed text-stone-500 dark:text-stone-400">
                {dragOver ? 'Release to transmute' : 'Drop a video, paste a link, or click'}
              </p>
            </div>
          )}
        </motion.div>

        <AnimatePresence>{dragOver && !busy && <PortalParticles />}</AnimatePresence>
      </div>

      <AnimatePresence mode="wait">
        {!busy && (
          <motion.div
            key="url-input"
            className="mt-8 w-full max-w-xl"
            initial={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0, marginTop: 0, overflow: 'hidden' }}
            transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          >
            <div className="flex gap-2">
              <div className={`flex-1 ${tw.glowWrap} input-glow-ember`}>
                <input
                  ref={urlInputRef}
                  type="url"
                  placeholder="Paste any video link — YouTube, Vimeo, direct MP4…"
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-stone-100 placeholder:text-stone-400 backdrop-blur-xl focus:border-[#2BA6A0] focus:outline-none focus:shadow-[0_2px_10px_-3px_rgba(43,166,160,0.5)] focus:ring-0 dark:border-white/10 dark:bg-white/[0.05] dark:text-stone-100 dark:placeholder:text-stone-500"
                  value={url}
                  onChange={(e) => onUrlChange(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onTransmute()}
                />
              </div>
        <Magnetic strength={0.25}>
          <Button
            onClick={onTransmute}
            disabled={!url.trim() || busy}
            className="shadow-lg"
          >
            Transmute
          </Button>
        </Magnetic>
            </div>
            <p className="mt-2 text-center text-xs text-stone-500 dark:text-stone-500">
              Supports 1,300+ sites via yt-dlp · direct files up to 2GB (MP4, MOV, AVI, WebM)
            </p>
          </motion.div>
        )}
      </AnimatePresence>
      {busy && (
        <div className="mt-8 w-full max-w-xl">
          <p className="text-center text-xs text-stone-500 dark:text-stone-500">
            Supports 1,300+ sites via yt-dlp · direct files up to 2GB (MP4, MOV, AVI, WebM)
          </p>
        </div>
      )}

      <div className="mt-6 w-full max-w-xl">
        <p className="mb-2 text-center font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">
          Transcript language
        </p>
        <div className="flex flex-wrap justify-center gap-1.5">
          {TRANSCRIPT_LANGUAGES.map((l) => {
            const active = l.code === outputLang
            return (
              <button
                key={l.code}
                type="button"
                onClick={() => onLangChange(l.code)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-all duration-200 ${
                  active
                    ? 'border-transparent bg-gradient-to-r from-[#2BA6A0] to-[#C17EF9] text-white shadow-[0_0_16px_rgb(193 126 249/0.45)]'
                    : 'border-white/70 bg-white/60 text-stone-600 hover:border-[#2BA6A0]/70 hover:text-[#155956] dark:border-white/10 dark:bg-white/[0.04] dark:text-stone-400 dark:hover:text-[#73CEC2]'
                }`}
              >
                {l.label}
              </button>
            )
          })}
        </div>
      </div>

      <AnimatedError message={error} />
    </section>
  )
}

function ProgressRing({ percent }: { percent: number }) {
  const r = 30
  const c = 2 * Math.PI * r
  const offset = c * (1 - Math.min(100, Math.max(0, percent)) / 100)
  return (
    <svg width="84" height="84" viewBox="0 0 84 84" className="-rotate-90">
      <defs>
        <linearGradient id="portal-progress" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2BA6A0" />
          <stop offset="100%" stopColor="#C17EF9" />
        </linearGradient>
      </defs>
      <circle cx="42" cy="42" r={r} fill="none" stroke="currentColor" strokeWidth="5" className="text-stone-200 dark:text-white/10" />
      <motion.circle
        cx="42" cy="42" r={r} fill="none"
        stroke="url(#portal-progress)" strokeWidth="5" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={offset}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      />
    </svg>
  )
}

function PortalParticles() {
  const particles = Array.from({ length: 14 }, (_, i) => {
    const angle = (i / 14) * Math.PI * 2
    return {
      angle,
      radius: 168 + (i % 3) * 34,
      size: 3 + (i % 3) * 1.5,
      delay: i * 0.045,
    }
  })
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center">
      {particles.map((p, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full bg-gradient-to-br from-[#73CEC2] to-[#C17EF9] shadow-[0_0_12px_rgb(193 126 249/0.9)]"
          style={{ width: p.size, height: p.size }}
          initial={{ x: Math.cos(p.angle) * p.radius, y: Math.sin(p.angle) * p.radius, opacity: 0.9, scale: 1 }}
          animate={{ x: Math.cos(p.angle) * 16, y: Math.sin(p.angle) * 16, opacity: 0, scale: 0.35 }}
          transition={{ duration: 0.75, delay: p.delay, ease: 'easeOut' }}
        />
      ))}
    </div>
  )
}

/* ─── Value pipeline (Transcribe → Diarize → Graph → Generate) ───────── */

function ValuePipeline({ flowStates, heading }: { flowStates: FlowState[]; heading?: string }) {
  return (
    <div>
      {heading && (
        <p className="mb-4 text-center font-mono text-[10px] font-medium uppercase tracking-[0.3em] text-stone-400 dark:text-stone-500">
          {heading}
        </p>
      )}
      <motion.div
        className="grid grid-cols-2 gap-3 md:grid-cols-4"
        initial="hidden"
        animate="show"
        variants={staggerContainer({ delay: 0.05 })}
      >
        {PIPELINE.map((step, i) => {
          const state = flowStates[i] ?? 'idle'
          const Icon = step.Icon
          return (
            <motion.div
              key={step.label}
              variants={staggerItem(fadeUpLift)}
              whileHover={{ y: -4 }}
              className={`group shine-card relative overflow-hidden rounded-2xl border p-4 backdrop-blur-xl shadow-[inset_0_1px_0_rgb(255_255_255/0.5)] transition-shadow duration-300 ${
                state === 'active'
                  ? 'border-[#2BA6A0]/50 bg-white/80 shadow-[0_0_30px_rgb(43 166 160/0.16),inset_0_1px_0_rgb(255_255_255/0.6)] dark:border-[#C17EF9]/40 dark:bg-white/[0.05]'
                  : state === 'done'
                    ? 'border-black/[0.05] bg-white/75 dark:border-white/10 dark:bg-white/[0.04]'
                    : 'border-black/[0.05] bg-white/70 dark:border-white/10 dark:bg-white/[0.03]'
              } hover:shadow-[0_18px_50px_rgb(46_22_66/0.14)] dark:hover:shadow-[0_18px_50px_rgb(0_0_0/0.4)]`}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br ${step.color} text-white shadow-sm transition-transform duration-300 group-hover:scale-105`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <AnimatePresence mode="wait" initial={false}>
                  {state === 'done' ? (
                    <motion.span
                      key="check"
                      initial={{ scale: 0.4, rotate: -60, opacity: 0 }}
                      animate={{ scale: 1, rotate: 0, opacity: 1 }}
                      exit={{ scale: 0.4, opacity: 0 }}
                      transition={transitions.micro}
                      className="ml-auto grid h-6 w-6 place-items-center rounded-full bg-[#2BA6A0] text-white shadow-[0_0_14px_rgb(43_166_160/0.6)]"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </motion.span>
                  ) : state === 'active' ? (
                    <motion.span
                      key="active"
                      initial={{ scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.4, opacity: 0 }}
                      transition={transitions.micro}
                      className="ml-auto grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-[#2BA6A0] to-[#C17EF9] shadow-[0_0_16px_rgb(43 166 160/0.7)]"
                    >
                      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-white" />
                    </motion.span>
                  ) : null}
                </AnimatePresence>
              </div>
              <p className="font-display mt-3 text-sm font-bold text-stone-900 dark:text-stone-100">{step.label}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-stone-500 dark:text-stone-400">{step.desc}</p>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-stone-200/80 dark:bg-white/10">
                <div
                  className={`h-full rounded-full transition-[width] duration-500 ease-out ${
                    state === 'done'
                      ? 'w-full bg-gradient-to-r from-[#C17EF9] to-[#2BA6A0]'
                      : state === 'active'
                        ? `bar-sweep w-2/3 bg-gradient-to-r ${step.color}`
                        : 'w-1/4 bg-stone-300 dark:bg-white/15'
                  }`}
                />
              </div>
            </motion.div>
          )
        })}
      </motion.div>
    </div>
  )
}

/* ─── Knowledge card (video "universe") ──────────────────────────────── */

const THUMB_GRADS = [
  'from-[#17090f] via-[#2a0e1f] to-[#0a0a0f]',
  'from-[#2a0e1f] via-[#3b0a2e] to-[#1f0d0a]',
  'from-[#1f0d0a] via-[#2a0e1f] to-[#17090f]',
  'from-[#2a0e1f] via-[#3a0f1e] to-[#0a0a0f]',
]

function thumbGrad(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return THUMB_GRADS[h % THUMB_GRADS.length]
}

// Hairline-divided stat cells in the workspace header strip. The value
// rolls up with the signature cinematic easing on mount and whenever it
// changes (a new video landing, a mapping completing).
function StatCell({ label, value, accent, suffix = '' }: { label: string; value: number; accent: string; suffix?: string }) {
  return (
    <div className="px-4 py-3 sm:px-5">
      <p className={`font-display tabular text-xl font-bold tracking-tight sm:text-2xl ${accent}`}>
        <CountUp value={value} suffix={suffix} />
      </p>
      <p className="eyebrow mt-0.5 text-stone-400 dark:text-stone-500">{label}</p>
    </div>
  )
}

// Rolls a number 0 → value, re-running only when the target actually
// changes. Written directly to the DOM so no extra re-renders occur.
function CountUp({ value, suffix = '' }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const fromRef = useRef(0)

  useEffect(() => {
    const from = fromRef.current
    const controls = animate(from, value, {
      duration: 0.9,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        fromRef.current = v
        if (ref.current) ref.current.textContent = `${Math.round(v)}${suffix}`
      },
    })
    return () => controls.stop()
  }, [value, suffix])

  return <span ref={ref}>0{suffix}</span>
}

// Compact row inside the "Now processing" rail — calm, no giant cards.
function ProcessingRow({ video, onClick }: { video: Video; onClick: () => void }) {
  const pct = STATUS_PROGRESS[video.status]
  return (
    <motion.div
      variants={staggerItem(scaleFade)}
      layout
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      className="group flex cursor-pointer items-center gap-3.5 px-4 py-3 transition-colors hover:bg-white/60 sm:px-5 dark:hover:bg-white/[0.04]"
    >
      <div className="relative h-11 w-[4.5rem] shrink-0 overflow-hidden rounded-xl">
        <div className={`absolute inset-0 bg-gradient-to-br ${thumbGrad(video._id)}`}>
          <div className="absolute inset-0 grid place-items-center opacity-60">
            <ThumbWave />
          </div>
        </div>
        {video.thumbnail && (
          <img src={video.thumbnail} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 skeleton-shimmer opacity-30" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-display truncate text-sm font-bold text-stone-900 dark:text-stone-100">{video.originalName}</p>
        <div className="mt-1.5 flex items-center gap-3">
          <div className="h-1 w-full max-w-[12rem] overflow-hidden rounded-full bg-stone-200/80 dark:bg-white/10">
            <motion.div
              className="bar-sweep h-full rounded-full bg-gradient-to-r from-[#2BA6A0] via-[#D4A34A] to-[#C17EF9]"
              initial={{ width: '8%' }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-stone-400 dark:text-stone-500">
            {STATUS_LABELS[video.status]}
          </span>
        </div>
      </div>
      <Badge tone="tangerine" className="shrink-0 hidden sm:inline-flex">
        <IconSparkles className="h-3 w-3" />
        Mapping…
      </Badge>
    </motion.div>
  )
}

function KnowledgeCard({ video, onClick, onRetry }: { video: Video; onClick: () => void; onRetry: (id: string) => void }) {
  const failed = video.status === 'failed'
  const processing = isProcessing(video.status)
  const done = video.status === 'done'
  const resume = done ? getResume(video._id) : null

  const open = () => {
    onClick()
  }

  // Detect the processing → done transition so the card can "pop" (spring).
  const [popCount, setPopCount] = useState(0)
  const prevStatus = useRef(video.status)
  useEffect(() => {
    if (prevStatus.current !== 'done' && video.status === 'done') {
      setPopCount((c) => c + 1)
    }
    prevStatus.current = video.status
  }, [video.status])

  const barWidth = STATUS_PROGRESS[video.status]

  // Cursor-tracking spotlight — throttled via rAF for integrated GPU.
  const cardRef = useRef<HTMLDivElement>(null)
  const [spot, setSpot] = useState({ x: 50, y: 50, on: false })
  const rafRef = useRef<number | null>(null)
  const onCardMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (rafRef.current) return
    const el = cardRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * 100
    const y = ((e.clientY - r.top) / r.height) * 100
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      setSpot({ x, y, on: true })
    })
  }

  return (
    <motion.div
      variants={staggerItem(scaleFade)}
      layout
      style={{ willChange: 'transform' }}
      className="h-full"
    >
      <motion.div
        ref={cardRef}
        key={popCount}
        onClick={open}
        role="button"
        tabIndex={0}
        aria-label={`Open ${video.originalName}`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            open()
          }
        }}
        onMouseMove={onCardMove}
        onMouseLeave={() => setSpot((s) => ({ ...s, on: false }))}
        initial={popCount > 0 ? { scale: 0.92 } : false}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 15 }}
        whileHover={failed ? { scale: 1.01 } : { y: -6, scale: 1.01 }}
        className={`group relative cursor-pointer overflow-hidden rounded-3xl border bg-white/75 backdrop-blur-xl shadow-[inset_0_1px_0_rgb(255_255_255/0.6)] transition-[border-color,box-shadow,background-color] duration-300 hover:bg-white/95 dark:bg-white/[0.03] dark:border-white/10 dark:backdrop-blur-xl dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.05)] dark:hover:bg-white/[0.06] ${
          failed
            ? 'border-red-500/20 shadow-[0_0_25px_-6px_rgba(239,68,68,0.2)] dark:border-red-500/25 dark:hover:shadow-[0_0_30px_-10px_rgba(239,68,68,0.5)]'
            : processing
              ? 'border-[#C17EF9]/30 shadow-[0_0_30px_-5px_rgba(193,126,249,0.4)] animate-pulse dark:border-[#C17EF9]/30 dark:shadow-[0_0_38px_-6px_rgba(193,126,249,0.5)]'
              : done
                ? 'border-black/[0.06] shadow-[0_18px_60px_rgba(15,23,42,0.10)] hover:shadow-[0_0_30px_-10px_rgba(43,166,160,0.8)] dark:border-white/10 dark:shadow-[0_18px_60px_rgba(0,0,0,0.4)]'
                : 'border-black/[0.06] shadow-[0_18px_60px_rgba(15,23,42,0.10)]'
        } dark:hover:shadow-[0_36px_100px_rgb(0_0_0/0.6)]`}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-20 rounded-3xl opacity-0 transition-opacity duration-300"
          style={{
            opacity: spot.on ? 1 : 0,
            background: `radial-gradient(420px circle at ${spot.x}% ${spot.y}%, rgb(193 126 249 / 0.10), transparent 62%)`,
          }}
        />
        <div className="pointer-events-none absolute -inset-px z-10 rounded-3xl opacity-0 transition-opacity duration-300 group-hover:opacity-100 dark:bg-[radial-gradient(120%_80%_at_50%_0%,rgb(193 126 249/0.18),transparent_60%)]" />

        <div className="relative aspect-video overflow-hidden">
          <div className={`absolute inset-0 bg-gradient-to-br transition-transform duration-500 group-hover:scale-[1.04] ${thumbGrad(video._id)}`}>
            <div className="absolute inset-0 grid place-items-center opacity-70">
              <ThumbWave />
            </div>
          </div>
          {video.thumbnail && (
            <img
              src={video.thumbnail}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            />
          )}
          {/* Shimmering glass for queued/downloading */}
          {(video.status === 'queued' || video.status === 'downloading') && (
            <>
              <div className="absolute inset-0 skeleton-shimmer opacity-40" />
              <div className="absolute inset-0 bg-gradient-to-t from-white/10 via-white/[0.04] to-white/10 backdrop-blur-[2px]" />
            </>
          )}
          {/* Filling gradient progress bar for processing */}
          {processing && (
            <div className="absolute inset-x-0 bottom-0 h-1 z-20">
              <motion.div
                className="bar-sweep h-full bg-gradient-to-r from-[#2BA6A0] via-[#D4A34A] to-[#C17EF9]"
                initial={{ width: '8%' }}
                animate={{ width: `${barWidth}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/50 to-transparent" />

          {done && (
            <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
              <motion.span
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={transitions.contentIn}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs font-medium text-[#2BA6A0] backdrop-blur-xl"
              >
                <Sparkles size={14} />
                Graph Mapped
              </motion.span>
              <motion.span
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...transitions.contentIn, delay: 0.08 }}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs font-medium text-[#C17EF9] backdrop-blur-xl"
              >
                <FileText size={14} />
                Summarized
              </motion.span>
            </div>
          )}
          {failed && (
            <span className="absolute left-3 top-3">
              <Badge tone="orchid">✕ Invocation failed</Badge>
            </span>
          )}

          <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[11px] font-semibold text-white/90 backdrop-blur-md">
            {video.source === 'url' ? <IconLink className="h-3 w-3" /> : <IconUpload className="h-3 w-3" />}
            {video.source === 'url' ? 'URL' : 'Upload'}
          </span>

          <div className="absolute inset-0 grid place-items-center bg-black/0 transition-colors duration-300 group-hover:bg-black/40">
            <span className="grid h-12 w-12 scale-75 place-items-center rounded-full bg-white/20 text-white opacity-0 backdrop-blur-sm transition-all duration-300 group-hover:scale-100 group-hover:opacity-100">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86a1 1 0 0 0-1.5.86z" /></svg>
            </span>
          </div>

          {processing && (
            <div className="absolute inset-0 grid place-items-center bg-[#050507]/75 backdrop-blur-[2px]">
              <div className="flex flex-col items-center gap-2">
                <div className="relative grid h-14 w-14 place-items-center">
                  <div className="spin-ring absolute inset-0 rounded-full" />
                  <motion.span
                    animate={{ scale: [1, 1.12, 1], opacity: [0.75, 1, 0.75] }}
                    transition={{ duration: 1.3, repeat: Infinity, ease: 'easeInOut' }}
                    className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[#2BA6A0] to-[#C17EF9] text-white shadow-[0_0_20px_rgb(193 126 249/0.7)]"
                  >
                    <IconSparkles className="h-3.5 w-3.5" />
                  </motion.span>
                </div>
                <p className="text-xs font-semibold text-white">Awakening AI…</p>
                <p className="text-[10px] text-white/60">{STATUS_LABELS[video.status]}</p>
              </div>
            </div>
          )}

          {resume != null && resume > 15 ? (
            <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-black/40 px-2 py-0.5 font-mono text-[10px] font-medium text-white backdrop-blur-md">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86a1 1 0 0 0-1.5.86z" /></svg>
              Resume {formatTime(resume)}
            </span>
          ) : video.duration > 0 && (
            <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-black/40 px-2 py-0.5 font-mono text-[10px] font-medium text-white backdrop-blur-md">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 3" />
              </svg>
              {formatTime(video.duration)}
            </span>
          )}
        </div>

        <div className="relative z-10 p-4">
          <p className="font-display truncate text-sm font-bold text-stone-900 transition-colors group-hover:text-[#155956] dark:text-stone-100 dark:group-hover:text-[#73CEC2]">{video.originalName}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
            {video.source === 'url' ? <IconLink className="h-3 w-3" /> : <IconUpload className="h-3 w-3" />}
            <span>{new Date(video.createdAt).toLocaleDateString()}</span>
            {video.duration > 0 && (
              <>
                <span aria-hidden className="text-stone-300 dark:text-stone-600">·</span>
                <span className="font-mono">{formatTime(video.duration)}</span>
              </>
            )}
          </p>

          {failed && (
            <div className="mt-3">
              {video.errorMessage && (
                <p className="mb-2 line-clamp-1 text-xs leading-relaxed text-red-400/90 dark:text-red-300/80">
                  {video.errorMessage.split('\n')[0]}
                </p>
              )}
              <Button
                variant="danger"
                size="sm"
                radius="full"
                onClick={(e) => {
                  e.stopPropagation()
                  onRetry(video._id)
                }}
                icon={
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12a9 9 0 1 0 2.6-6.4" />
                    <path d="M3 4v5h5" />
                  </svg>
                }
              >
                Retry Invocation
              </Button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

// Dense list view — thumbnail on the left, metadata flowing right.
function KnowledgeRow({ video, onClick, onRetry }: { video: Video; onClick: () => void; onRetry: (id: string) => void }) {
  const failed = video.status === 'failed'
  const done = video.status === 'done'
  const resume = done ? getResume(video._id) : null

  return (
    <motion.div
      variants={staggerItem(scaleFade)}
      layout
      whileHover={{ y: -2 }}
      role="button"
      tabIndex={0}
      aria-label={`Open ${video.originalName}`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      className={`group flex cursor-pointer items-center gap-4 overflow-hidden rounded-2xl border bg-white/70 p-3 shadow-[inset_0_1px_0_rgb(255_255_255/0.6)] backdrop-blur-xl transition-[border-color,box-shadow,background-color] duration-300 hover:bg-white/95 dark:border-white/10 dark:bg-white/[0.03] dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.05)] dark:hover:bg-white/[0.06] ${
        failed ? 'border-red-500/20 dark:border-red-500/25' : done ? 'border-black/[0.06] hover:shadow-[0_0_30px_-10px_rgba(43,166,160,0.7)] dark:border-white/10' : 'border-black/[0.06] dark:border-white/10'
      } dark:hover:shadow-[0_18px_50px_rgb(0_0_0/0.5)]`}
    >
      <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-xl">
        <div className={`absolute inset-0 bg-gradient-to-br ${thumbGrad(video._id)}`}>
          <div className="absolute inset-0 grid place-items-center opacity-60">
            <ThumbWave />
          </div>
        </div>
        {video.thumbnail && (
          <img src={video.thumbnail} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]" />
        )}
        <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/40 to-transparent" />
        {video.duration > 0 && (
          <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/50 px-1.5 py-0.5 font-mono text-[9px] font-medium text-white backdrop-blur-sm">
            {formatTime(video.duration)}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-display truncate text-sm font-bold text-stone-900 transition-colors group-hover:text-[#155956] dark:text-stone-100 dark:group-hover:text-[#73CEC2]">
            {video.originalName}
          </p>
          {failed && <Badge tone="orchid">✕ Failed</Badge>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
            {video.source === 'url' ? <IconLink className="h-3 w-3" /> : <IconUpload className="h-3 w-3" />}
            {video.source === 'url' ? 'URL' : 'Upload'}
          </span>
          <span className="text-xs text-stone-400 dark:text-stone-500">{new Date(video.createdAt).toLocaleDateString()}</span>
          {failed && video.errorMessage && (
            <span className="line-clamp-1 text-xs text-red-400/90 dark:text-red-300/80">{video.errorMessage.split('\n')[0]}</span>
          )}
        </div>
      </div>

      {done && (
        <div className="hidden shrink-0 flex-col items-end gap-1.5 sm:flex">
          <Badge tone="tangerine">
            <Sparkles size={11} />
            Graph Mapped
          </Badge>
          {resume != null && resume > 15 && (
            <Badge tone="orchid">
              <FileText size={11} />
              Resume {formatTime(resume)}
            </Badge>
          )}
        </div>
      )}

      {failed && (
        <Button
          variant="danger"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            onRetry(video._id)
          }}
          icon={
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 2.6-6.4" />
              <path d="M3 4v5h5" />
            </svg>
          }
        >
          Retry
        </Button>
      )}
    </motion.div>
  )
}

function ThumbWave() {
  return (
    <svg width="64" height="40" viewBox="0 0 64 40" fill="none" aria-hidden="true" className="text-[#73CEC2]/80">
      {Array.from({ length: 28 }, (_, i) => {
        const h = 5 + ((i * 7) % 12)
        return (
          <rect
            key={i}
            x={i * 2.2}
            y={20 - h / 2}
            width="1.4"
            height={h}
            rx="0.7"
            fill="currentColor"
            className="wave-bar"
            style={{ animationDelay: `${-(i * 0.09)}s` }}
          />
        )
      })}
    </svg>
  )
}

function AnimatedError({ message }: { message: string }) {
  if (!message) return null
  return (
    <motion.div
      className="mt-4 w-full max-w-xl rounded-xl border border-red-500/30 bg-red-500/10 p-3 shadow-[0_0_15px_-5px_rgba(239,68,68,0.3)]"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transitions.contentIn}
      role="alert"
    >
      <p className="text-sm text-red-200 dark:text-red-200">{message}</p>
    </motion.div>
  )
}

/* ─── Inline icons ───────────────────────────────────────────────────── */

function IconSparkles({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9.9 2.4 11 6l3.6 1.1-3.6 1.1L9.9 12l-1.1-3.8L5.2 7.1 8.8 6z" />
      <path d="m17 14 .8 2.4 2.4.8-2.4.8L17 20.4l-.8-2.4-2.4-.8 2.4-.8z" />
    </svg>
  )
}

function IconMic({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" />
      <path d="M19 11a7 7 0 0 1-14 0" />
      <path d="M12 18v3" />
    </svg>
  )
}

function IconUsers({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 5.2a3.5 3.5 0 0 1 0 6.6" />
      <path d="M17.5 14.3a6.5 6.5 0 0 1 4 5.7" />
    </svg>
  )
}

function IconGraph({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="5" r="2" />
      <circle cx="5" cy="19" r="2" />
      <circle cx="19" cy="19" r="2" />
      <path d="m10.2 6.6-4.1 10.9" />
      <path d="m13.8 6.6 4.1 10.9" />
      <path d="M7 19h10" />
    </svg>
  )
}

function IconSearch({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  )
}

function IconArrowDown({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 5v14m0 0 6-6m-6 6-6-6" />
    </svg>
  )
}

function IconGrid({ className }: { className?: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  )
}

function IconList({ className }: { className?: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  )
}

function IconLink({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
    </svg>
  )
}

function IconUpload({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M17 8l-5-5-5 5" />
      <path d="M12 3v12" />
    </svg>
  )
}
