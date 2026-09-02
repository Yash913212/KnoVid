import { useState, useMemo, useRef, useCallback, useEffect, lazy, Suspense, Fragment } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { BrainCircuit, Check, Eye, Maximize2, Minimize2, RotateCcw, Sparkles } from 'lucide-react'
import { useFetch } from '../hooks/useFetch'
import { getVideo, retryVideo, isProcessing, STATUS_DOTS, STATUS_PIPELINE_STEP, type Video } from '../api/videos'
import { getTranscript, type Transcript, type Segment } from '../api/transcripts'
import { getGraph, type Graph, type GraphNode } from '../api/graphs'
import { getChapters, type Chapter } from '../api/chapters'
import { translateVideo } from '../api/translate'
import {
  generateContent,
  askQuestion,
  exportVideo,
  type GeneratedContent,
} from '../api/generate'
import { formatTime } from '../utils'
import { getResume, setResume, clearResume } from '../lib/resume'
import { setPlayhead } from '../lib/playhead'
import { contentStream, staggerContainer, staggerItem, materialize, chatBubble, transitions, tw, usePrefersReducedMotion } from '../lib/motion'
import { useToast } from '../components/Toast'
import { Button } from '../components/ui/Button'
import { GlassCard } from '../components/ui/GlassCard'
import { Eyebrow } from '../components/ui/Eyebrow'
import { Spinner } from '../components/ui/Spinner'
import TranscriptSection from '../components/TranscriptSection'
import VideoPlayer, { type VideoPlayerHandle } from '../components/VideoPlayer'
import SemanticChapters from '../components/SemanticChapters'
import ConceptDiffusion from '../components/ConceptDiffusion'
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

const ENTITY_ICONS: Record<string, string> = {
  PERSON: '👤', ORG: '🏢', GPE: '📍', LOC: '📍',
  PRODUCT: '📦', EVENT: '📅', WORK_OF_ART: '🎨', LAW: '⚖️',
}

type MainTab = 'transcript' | 'graph' | 'generate' | 'recall' | 'diffusion'
type GraphView = 'neural' | 'tree' | 'network' | 'list'

export default function VideoDetail() {
  const { id } = useParams<{ id: string }>()
  const [mainTab, setMainTab] = useState<MainTab>('transcript')
  const [graphView, setGraphView] = useState<GraphView>('neural')
  const [targetLang, setTargetLang] = useState('')
  const [translatedSegments, setTranslatedSegments] = useState<Segment[] | null>(null)
  const [translatedLabels, setTranslatedLabels] = useState<Record<string, string> | null>(null)
  const [translatedLang, setTranslatedLang] = useState<string | null>(null)
  const [translating, setTranslating] = useState(false)
  const lastSavedResume = useRef(0)
  const playerRef = useRef<VideoPlayerHandle>(null)
  const [retrying, setRetrying] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)
  const [resumeAt, setResumeAt] = useState<number | null>(() => (id ? getResume(id) : null))

  const navigate = useNavigate()
  const { toast } = useToast()

  const { data: video, loading: loadingVideo } = useFetch<Video | null>(
    () => (id ? getVideo(id) : Promise.reject()), [id, refreshTick]
  )
  const { data: transcript } = useFetch<Transcript | null>(
    () => (id && (video?.status === 'analyzing' || video?.status === 'done') ? getTranscript(id).catch(() => null) : Promise.resolve(null)), [id, video?.status, refreshTick]
  )
  const { data: graph } = useFetch<Graph | null>(
    () => (id && video?.status === 'done' ? getGraph(id).catch(() => null) : Promise.resolve(null)), [id, video?.status, refreshTick]
  )
  const { data: chaptersData } = useFetch<{ chapters: Chapter[] } | null>(
    () => (id && video?.status === 'done' ? getChapters(id).catch(() => null) : Promise.resolve(null)), [id, video?.status, refreshTick]
  )
  const chapters = useMemo(() => chaptersData?.chapters ?? [], [chaptersData])

  useEffect(() => {
    if (!id || !transcript || !targetLang) {
      setTranslatedSegments(null)
      setTranslatedLabels(null)
      setTranslatedLang(null)
      return
    }
    let cancelled = false
    setTranslating(true)
    translateVideo(id, targetLang)
      .then((res) => {
        if (!cancelled) {
          setTranslatedSegments(res.segments)
          setTranslatedLabels(res.nodeLabels)
          setTranslatedLang(targetLang)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTranslatedLang(null)
          toast('Could not translate transcript', 'error')
        }
      })
      .finally(() => {
        if (!cancelled) setTranslating(false)
      })
    return () => { cancelled = true }
  }, [id, transcript, targetLang, toast])

  useEffect(() => {
    if (!id || !video || !isProcessing(video.status)) return
    const interval = setInterval(async () => {
      try {
        const updated = await getVideo(id)
        if (updated.status !== video.status) setRefreshTick((t) => t + 1)
      } catch {}
    }, 4000)
    return () => clearInterval(interval)
  }, [id, video])

  const displaySegments = useMemo(
    () => (translatedSegments && translatedLang === targetLang ? translatedSegments : transcript?.segments ?? []),
    [translatedSegments, translatedLang, transcript, targetLang]
  )

  // Recall is built from the transcript itself: every prompt remains tied to
  // a timestamp, so practice can always return to the source evidence.
  const recallCards = useMemo(() => {
    const useful = displaySegments.filter((segment) => segment.text.trim().length > 55)
    return (useful.length > 0 ? useful : displaySegments).slice(0, 8)
  }, [displaySegments])
  const [recallIndex, setRecallIndex] = useState(0)
  const [recallRevealed, setRecallRevealed] = useState(false)
  const [recallRemembered, setRecallRemembered] = useState(0)

  useEffect(() => {
    setRecallIndex(0)
    setRecallRevealed(false)
    setRecallRemembered(0)
  }, [id, targetLang])

  const displayNodes: GraphNode[] = useMemo(() => {
    if (!graph) return []
    if (!translatedLabels || translatedLang !== targetLang) return graph.nodes
    return graph.nodes.map((n) => ({
      ...n,
      label: translatedLabels[n.id] || n.label,
    }))
  }, [graph, translatedLabels, translatedLang, targetLang])

  const entities = useMemo(() => displayNodes.filter((n) => n.type === 'entity') ?? [], [displayNodes])
  const topics = useMemo(() => displayNodes.filter((n) => n.type === 'topic') ?? [], [displayNodes])
  const keywords = useMemo(() => displayNodes.filter((n) => n.type === 'keyword') ?? [], [displayNodes])

  const handleSeek = useCallback((seconds: number) => {
    playerRef.current?.seekTo(seconds)
  }, [])

  // Track playhead (via the external store, so the page does not re-render at
  // playback rate) + persist a resume position (throttled, ~5s).
  const handleTimeUpdate = useCallback(
    (seconds: number) => {
      setPlayhead(seconds)
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

  const originalLang = transcript?.language || 'en'

  const handleRetry = async () => {
    if (!id) return
    setRetrying(true)
    try {
      await retryVideo(id)
      setRefreshTick((t) => t + 1)
      setRetrying(false)
    } catch {
      setRetrying(false)
      toast('Could not retry processing', 'error')
    }
  }

  const loading = loadingVideo
  if (loading) {
    return <WorkspaceSkeleton />
  }
  if (!video) {
    return (
      <div className="min-h-screen overflow-x-hidden bg-[#FAFAFA] px-4 py-24 dark:bg-[#0A0A0A]">
        <main className="mx-auto max-w-2xl">
          <GlassCard className="px-8 py-14 text-center">
            <Eyebrow tone="default" className="justify-center">Universe not found</Eyebrow>
            <h1 className="font-display mt-3 text-2xl font-bold tracking-tight text-stone-900 dark:text-white">
              This universe has <span className="font-serif italic font-normal title-gradient">vanished</span>.
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-500 dark:text-stone-400">
              The video you're looking for may have been removed, or its link has run out of energy. Return to your workspace and summon it again.
            </p>
            <Button variant="secondary" onClick={() => navigate('/app')} className="mt-8">
              Back to workspace
            </Button>
          </GlassCard>
        </main>
      </div>
    )
  }

  return (
    <div className="workspace-page">
      <main className="mx-auto w-full max-w-7xl px-4 py-8">
        {/* ── Back → workspace breadcrumb ───────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={transitions.content}
        >
          <Button variant="secondary" onClick={() => navigate('/app')} className="mb-4" aria-label="Back to workspace">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Back to workspace
          </Button>
        </motion.div>

        {/* ── Player with orchid glow + pill badges ─────────────── */}
        <motion.div
          className="group relative overflow-hidden rounded-3xl border border-black/[0.06] bg-white/70 p-2 shadow-[inset_0_1px_0_rgb(255_255_255/0.6),0_0_60px_rgb(193_126_249/0.14),0_0_130px_rgb(43_166_160/0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-stone-900/70 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.05),0_0_70px_rgb(193_126_249/0.20),0_0_150px_rgb(43_166_160/0.12)]"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={transitions.content}
        >
          <div className="player-aura" aria-hidden />
          <VideoPlayer ref={playerRef} url={video.url} filePath={video.filePath} title={video.originalName} onTimeUpdate={handleTimeUpdate} />
          {resumeAt != null && resumeAt > 15 && video.status === 'done' && (
            <motion.button
              type="button"
              onClick={handleResume}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={transitions.content}
              className="absolute right-5 top-5 z-30 flex items-center gap-2 rounded-full border border-[#2BA6A0]/50 bg-stone-950/85 px-3 py-1.5 text-xs font-semibold text-[#B5E4D5] shadow-lg backdrop-blur-md transition-all hover:scale-[1.03] hover:bg-stone-900"
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
              className="appearance-none rounded-full border border-black/10 bg-white/70 py-1.5 pl-3 pr-8 text-xs font-semibold text-stone-700 outline-none transition-colors focus:border-[#2BA6A0]/60 dark:border-white/15 dark:bg-white/[0.04] dark:text-stone-200 dark:focus:border-[#C17EF9]/60"
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
              ) : translatedLang === targetLang ? (
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
            duration={video.duration}
          />
        </motion.div>

        {/* ── Tabs ──────────────────────────────────────────────── */}
        <div className="mt-6 flex gap-1 rounded-2xl border border-black/[0.06] bg-white/70 p-1 shadow-[inset_0_1px_0_rgb(255_255_255/0.6)] backdrop-blur-xl dark:border-white/10 dark:bg-stone-900/70">
          <TabBtn active={mainTab === 'transcript'} onClick={() => setMainTab('transcript')}>Transcript</TabBtn>
          <TabBtn active={mainTab === 'graph'} onClick={() => setMainTab('graph')} disabled={!transcript}>
            Knowledge Graph {graph ? `(${graph.nodes.length})` : ''}
          </TabBtn>
          <TabBtn active={mainTab === 'generate'} onClick={() => setMainTab('generate')} disabled={!transcript}>AI Chat</TabBtn>
          <TabBtn active={mainTab === 'diffusion'} onClick={() => setMainTab('diffusion')} disabled={!graph || displaySegments.length === 0}>
            Diffusion
          </TabBtn>
          <TabBtn active={mainTab === 'recall'} onClick={() => setMainTab('recall')} disabled={!transcript || recallCards.length === 0}>
            Recall Loop
          </TabBtn>
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
                <div className="space-y-4">
                  {chapters.length > 0 && (
                    <SemanticChapters
                      chapters={chapters}
                      duration={video.duration || displaySegments[displaySegments.length - 1]?.end || 0}
                      onSeek={handleSeek}
                    />
                  )}
                  <TranscriptSection
                    videoId={id!}
                    segments={displaySegments}
                    langLabel={targetLang || originalLang}
                    onSeek={handleSeek}
                  />
                </div>
              ) : video.status === 'done' ? (
                <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-[#2BA6A0]/40 bg-white/65 py-16 text-center text-stone-500 backdrop-blur-xl dark:border-[#C17EF9]/40 dark:bg-stone-900/50 dark:text-stone-400">
                  No transcript.
                </div>
              ) : (
                <OutputSkeleton lines={5} />
              ))}

              {mainTab === 'graph' && (
                graph ? (
                  /* Full-bleed: breaks the max-w-5xl column, edge-to-edge */
                  <div className="relative left-1/2 right-1/2 w-screen -mx-[50vw] overflow-visible">
                    <div className="px-4 pb-12 sm:px-6">
                      <div className="flex gap-1 rounded-xl border border-black/[0.06] bg-white/70 p-1 shadow-[inset_0_1px_0_rgb(255_255_255/0.6)] backdrop-blur-xl dark:border-white/10 dark:bg-stone-900/70">
                        <ViewBtn active={graphView === 'neural'} onClick={() => setGraphView('neural')}>Neural</ViewBtn>
                        <ViewBtn active={graphView === 'tree'} onClick={() => setGraphView('tree')}>Tree</ViewBtn>
                        <ViewBtn active={graphView === 'network'} onClick={() => setGraphView('network')}>Network</ViewBtn>
                        <ViewBtn active={graphView === 'list'} onClick={() => setGraphView('list')}>List</ViewBtn>
                      </div>

                      <div className="mt-4">
                        <AnimatePresence mode="wait" initial={false}>
                          <motion.div
                            key={graphView}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={transitions.micro}
                          >
                            {graphView === 'neural' ? (
                              <Suspense fallback={<GraphFallback />}>
                                <NeuralBreakout
                                  videoId={id!}
                                  nodes={displayNodes}
                                  edges={graph.edges}
                                  segments={displaySegments}
                                  onSeek={handleSeek}
                                />
                              </Suspense>
                            ) : graphView === 'tree' ? (
                              <Suspense fallback={<GraphFallback />}>
                                <div className="h-[calc(100dvh-8rem)] w-full">
                                  <TopicTree graphNodes={displayNodes} graphEdges={graph.edges} onSeek={handleSeek} />
                                </div>
                              </Suspense>
                            ) : graphView === 'network' ? (
                              <Suspense fallback={<GraphFallback />}>
                                <div className="h-[calc(100dvh-8rem)] w-full">
                                  <KnowledgeGraph graphNodes={displayNodes} graphEdges={graph.edges} onSeek={handleSeek} />
                                </div>
                              </Suspense>
                            ) : (
                              <div className="mx-auto max-w-7xl space-y-8">
                                {topics.length > 0 && (
                                  <section>
                                    <h3 className="font-display mb-3 text-lg font-bold text-stone-800 dark:text-stone-200">Topics</h3>
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
                                    <h3 className="font-display mb-3 text-lg font-bold text-stone-800 dark:text-stone-200">Entities</h3>
                                    <motion.div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" initial="initial" animate="animate" variants={staggerContainer()}>
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
                                    <h3 className="font-display mb-3 text-lg font-bold text-stone-800 dark:text-stone-200">Key Terms</h3>
                                    <div className="flex flex-wrap gap-2">
                                      {keywords.map((node) => (
                                        <span key={node.id} className="rounded-full border border-stone-200 bg-gray-100 px-3 py-1 text-sm text-gray-700 cursor-pointer transition-colors duration-150 ease-out hover:border-[#2BA6A0]/50 hover:bg-[#2BA6A0]/10 shadow-[inset_0_1px_0_rgb(255_255_255/0.6)] dark:border-white/10 dark:bg-stone-800 dark:text-stone-300 dark:hover:border-[#C17EF9]/40 dark:hover:bg-[#C17EF9]/10 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.05)]"
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
                    </div>
                  </div>
                ) : null
              )}

              {mainTab === 'graph' && !graph && (
                <div className="rounded-3xl border border-dashed border-[#2BA6A0]/40 bg-white/65 py-16 text-center text-stone-500 backdrop-blur-xl dark:border-[#C17EF9]/40 dark:bg-stone-900/50 dark:text-stone-400">
                  {video.status === 'done' ? 'Analysis will appear once processing is complete.' : <OutputSkeleton lines={3} />}
                </div>
              )}

              {mainTab === 'generate' && <GeneratePanel videoId={id!} />}

              {mainTab === 'diffusion' && graph && displaySegments.length > 0 && (
                <ConceptDiffusion
                  segments={displaySegments}
                  nodes={displayNodes}
                  duration={video.duration || displaySegments[displaySegments.length - 1]?.end || 0}
                  onSeek={handleSeek}
                />
              )}

              {mainTab === 'recall' && recallCards.length > 0 && (
                <RecallPanel
                  videoTitle={video.originalName}
                  cards={recallCards}
                  index={recallIndex}
                  revealed={recallRevealed}
                  remembered={recallRemembered}
                  onReveal={() => setRecallRevealed(true)}
                  onRemember={() => {
                    setRecallRemembered((count) => count + 1)
                    setRecallRevealed(false)
                    setRecallIndex((current) => (current + 1) % recallCards.length)
                  }}
                  onReset={() => {
                    setRecallIndex(0)
                    setRecallRemembered(0)
                    setRecallRevealed(false)
                  }}
                  onSeek={handleSeek}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  )
}

function RecallPanel({
  videoTitle,
  cards,
  index,
  revealed,
  remembered,
  onReveal,
  onRemember,
  onReset,
  onSeek,
}: {
  videoTitle: string
  cards: Segment[]
  index: number
  revealed: boolean
  remembered: number
  onReveal: () => void
  onRemember: () => void
  onReset: () => void
  onSeek: (seconds: number) => void
}) {
  const card = cards[index]
  const progress = Math.min(100, Math.round((remembered / cards.length) * 100))
  const speaker = card.speaker || 'Speaker'

  return (
    <section className="overflow-hidden rounded-[2rem] border border-[#C17EF9]/20 bg-stone-950 text-white shadow-[0_30px_90px_rgb(193_126_249/0.15)]">
      <div className="relative overflow-hidden px-5 py-6 sm:px-8 sm:py-8">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[#C17EF9]/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/4 h-64 w-64 rounded-full bg-[#2BA6A0]/15 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl">
            <div className="flex items-center gap-2 text-[#B5E4D5]">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-[#2BA6A0] to-[#C17EF9] shadow-[0_0_22px_rgb(193_126_249/0.45)]">
                <BrainCircuit size={17} />
              </span>
              <span className="font-mono text-[10px] font-medium uppercase tracking-[0.24em]">KnoVid Recall Loop</span>
            </div>
            <h2 className="font-display mt-4 text-2xl font-black tracking-tight sm:text-3xl">
              Remember it before you <span className="font-serif italic font-normal title-gradient">reread</span> it.
            </h2>
            <p className="mt-2 text-sm leading-6 text-stone-400">
              A quick retrieval pass over the moments that shaped this video. Every answer stays anchored to the speaker and timestamp.
            </p>
          </div>
          <div className="min-w-[12rem] rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl">
            <div className="flex items-center justify-between text-xs text-stone-400">
              <span>Memory pass</span>
              <span className="font-mono text-[#B5E4D5]">{remembered}/{cards.length}</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <motion.div className="h-full rounded-full bg-gradient-to-r from-[#2BA6A0] to-[#C17EF9]" animate={{ width: `${progress}%` }} />
            </div>
            <p className="mt-2 text-[11px] text-stone-500">Source: {videoTitle}</p>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 bg-black/20 p-5 sm:p-8">
        <div className="mx-auto max-w-2xl">
          <div className="mb-5 flex items-center justify-between gap-3">
            <span className="rounded-full border border-[#2BA6A0]/30 bg-[#2BA6A0]/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[#B5E4D5]">
              Prompt {index + 1}
            </span>
            <button type="button" onClick={() => onSeek(card.start)} className="inline-flex items-center gap-1.5 text-xs text-stone-400 transition-colors hover:text-white">
              <Eye size={14} /> Revisit {formatTime(card.start)}
            </button>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-5 sm:p-7">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#E3C4FF]">{speaker} · {formatTime(card.start)}</p>
            <h3 className="mt-3 font-display text-xl font-bold leading-snug sm:text-2xl">
              What is the core idea in this moment?
            </h3>
            <AnimatePresence mode="wait">
              {revealed ? (
                <motion.div key="answer" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-5 rounded-2xl border border-[#C17EF9]/25 bg-[#C17EF9]/[0.08] p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[#E3C4FF]"><Sparkles size={14} /> Source answer</div>
                  <p className="text-sm leading-7 text-stone-200">{card.text}</p>
                </motion.div>
              ) : (
                <motion.p key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 text-sm leading-6 text-stone-500">
                  Say it in your own words, then reveal the source moment.
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={onReset} className="inline-flex items-center gap-2 text-xs text-stone-500 transition-colors hover:text-stone-200">
              <RotateCcw size={14} /> Reset pass
            </button>
            <div className="flex gap-2">
              {!revealed ? (
                <button type="button" onClick={onReveal} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.08] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/[0.14]">
                  Reveal source <Eye size={15} />
                </button>
              ) : (
                <button type="button" onClick={onRemember} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#2BA6A0] to-[#C17EF9] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_rgb(193_126_249/0.35)] transition-transform hover:-translate-y-0.5">
                  I remembered it <Check size={15} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
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

type StepState = 'done' | 'active' | 'pending' | 'failed'

function PipelineStepper({
  status,
  onRetry,
  retrying,
  duration,
}: {
  status: Video['status']
  onRetry: () => void
  retrying: boolean
  duration: number
}) {
  const failed = status === 'failed'
  const done = status === 'done'
  const idx = STATUS_PIPELINE_STEP[status] ?? 0

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
            <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-xs text-red-400">Processing failed</span>
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
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#2BA6A0] text-white shadow-[0_0_16px_rgb(43_166_160/0.5)]"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={transitions.contentIn}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
        </motion.span>
        <span className="hidden text-xs font-semibold text-[#2BA6A0] sm:block">{label}</span>
      </span>
    )
  }
  if (state === 'active') {
    return (
      <span className="flex items-center gap-2">
        <span className="relative grid h-7 w-7 shrink-0 place-items-center">
          <span className="spin-ring absolute inset-0" />
          <span className="step-ring absolute inset-0" />
          <motion.span
            className="h-3.5 w-3.5 rounded-full bg-gradient-to-br from-[#2BA6A0] to-[#C17EF9] shadow-[0_0_16px_rgb(193_126_249/0.7)]"
            animate={reduced ? {} : { scale: [1, 1.18, 1] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
          />
        </span>
        <motion.span
          className="hidden animate-pulse text-xs font-semibold text-[#C17EF9] sm:block"
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
      ? 'bg-[#2BA6A0]/60'
      : state === 'active'
        ? 'bg-gradient-to-r from-[#2BA6A0]/60 to-[#C17EF9]/60'
        : 'bg-black/10 dark:bg-white/10'
  return <span className={`h-0.5 min-w-3 flex-1 rounded-full ${cls}`} />
}

function StatusChip({ status, duration }: { status: string; duration: number }) {
  const processing = isProcessing(status as Video['status'])
  return (
    <span className="flex items-center gap-2 text-xs">
      <span className={`w-2 h-2 rounded-full ${STATUS_DOTS[status as Video['status']] || 'bg-gray-300'} ${processing ? 'animate-pulse' : ''}`} />
      <span className="font-semibold capitalize text-stone-700 dark:text-stone-200">{status}</span>
      {duration > 0 && <span className="font-mono text-stone-400 dark:text-stone-500">{formatTime(duration)}</span>}
    </span>
  )
}

function Chip({ tone = 'default', children }: { tone?: 'default' | 'tangerine' | 'orchid'; children: React.ReactNode }) {
  const cls = {
    default: 'border-black/10 bg-white/70 text-stone-600 dark:border-white/15 dark:bg-white/[0.04] dark:text-stone-300',
    tangerine: 'border-[#2BA6A0]/40 bg-[#2BA6A0]/10 text-[#155956] dark:border-[#2BA6A0]/35 dark:bg-[#2BA6A0]/[0.08] dark:text-[#73CEC2]',
    orchid: 'border-[#C17EF9]/40 bg-[#C17EF9]/10 text-[#7E3AF2] dark:border-[#C17EF9]/35 dark:bg-[#C17EF9]/[0.08] dark:text-[#E3C4FF]',
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
      <main className="mx-auto w-full max-w-7xl px-4 py-8" aria-hidden="true">
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
          className="absolute rounded-full bg-[#C17EF9]/40 animate-pulse dark:bg-[#C17EF9]/30"
          style={{ top: n.top, left: n.left, width: n.size, height: n.size, animationDelay: `${i * 160}ms` }}
        />
      ))}
      {[0, 1, 2].map((i) => (
        <span
          key={`line-${i}`}
          className="absolute h-px bg-[#2BA6A0]/30"
          style={{ top: `${30 + i * 16}%`, left: '35%', width: `${38 + i * 4}%`, transform: `rotate(${i * 18}deg)` }}
        />
      ))}
    </div>
  )
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
    { key: 'summary' as const, label: 'Summary', desc: 'Concise overview', icon: 'S', color: 'from-[#2BA6A0] to-[#D4A34A]' },
    { key: 'notes' as const, label: 'Study Notes', desc: 'Structured key points', icon: 'N', color: 'from-[#C17EF9] to-[#C08BF0]' },
    { key: 'quiz' as const, label: 'Quiz', desc: 'Test your knowledge', icon: 'Q', color: 'from-[#D4A34A] to-[#C17EF9]' },
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
                <p className="mt-2 flex items-center gap-1.5 text-xs text-[#1D7773] dark:text-[#73CEC2]">
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
                <span className="rounded-full border border-[#2BA6A0]/40 bg-[#2BA6A0]/10 px-2 py-0.5 text-xs font-medium uppercase text-[#155956] dark:border-[#2BA6A0]/30 dark:bg-[#2BA6A0]/[0.08] dark:text-[#73CEC2]">{type}</span>
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
                className="ml-auto max-w-[85%] self-end rounded-2xl border border-[#2BA6A0]/40 bg-[#2BA6A0]/80 text-white shadow-[0_4px_20px_rgb(43_166_160/0.35)] backdrop-blur-xl"
              >
                {item.q}
              </motion.div>
              <motion.div
                initial={chatBubble('assistant').initial}
                animate={chatBubble('assistant').animate}
                transition={transitions.contentIn}
                className="flex max-w-[85%] gap-2.5 self-start"
              >
                <span className="relative mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#C17EF9] to-[#C08BF0] shadow-[0_0_16px_rgb(193_126_249/0.7)]">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M9.9 2.4 11 6l3.6 1.1-3.6 1.1L9.9 12l-1.1-3.8L5.2 7.1 8.8 6z" />
                    <path d="m17 14 .8 2.4 2.4.8-2.4.8L17 20.4l-.8-2.4-2.4-.8 2.4-.8z" />
                  </svg>
                </span>
                <div className="whitespace-pre-wrap rounded-2xl border border-[#C17EF9]/25 bg-black/40 px-3.5 py-2.5 text-sm text-stone-200 shadow-[0_4px_24px_rgb(193_126_249/0.15)] backdrop-blur-xl">
                  <Typewriter text={item.a} />
                </div>
              </motion.div>
            </Fragment>
          ))}
          {chatLoading && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={transitions.contentIn}
              className="flex max-w-[85%] gap-2.5 self-start"
            >
              <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#C17EF9] to-[#C08BF0] shadow-[0_0_16px_rgb(193_126_249/0.6)]">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M9.9 2.4 11 6l3.6 1.1-3.6 1.1L9.9 12l-1.1-3.8L5.2 7.1 8.8 6z" />
                  <path d="m17 14 .8 2.4 2.4.8-2.4.8L17 20.4l-.8-2.4-2.4-.8 2.4-.8z" />
                </svg>
              </span>
              <div className="inline-flex items-center gap-1.5 rounded-2xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-[#E3C4FF] backdrop-blur-xl">
                <TypingDots />
                <span className="text-xs">Thinking…</span>
              </div>
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
      className={`relative rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 ease-out ${
        disabled
          ? 'cursor-not-allowed text-stone-300 dark:text-stone-600'
          : active
            ? 'text-white'
            : 'text-stone-500 hover:bg-white/80 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800/70 dark:hover:text-stone-100'
      }`}
    >
      {active && (
        <motion.span
          layoutId="main-tab-pill"
          className="absolute inset-0 -z-10 rounded-xl bg-gradient-to-r from-[#2BA6A0] to-[#C17EF9] shadow-[0_6px_20px_rgb(193_126_249/0.35)]"
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        />
      )}
      {children}
    </button>
  )
}

function ViewBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`relative rounded-xl px-3 py-1.5 text-sm font-medium transition-all duration-200 ease-out ${
        active
          ? 'text-white'
          : 'text-stone-500 hover:bg-white/80 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800/70 dark:hover:text-stone-100'
      }`}
    >
      {active && (
        <motion.span
          layoutId="graph-view-pill"
          className="absolute inset-0 -z-10 rounded-xl bg-gradient-to-r from-[#2BA6A0] to-[#C17EF9] shadow-[0_4px_16px_rgb(193_126_249/0.3)]"
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        />
      )}
      {children}
    </button>
  )
}

// Immersive knowledge-graph canvas that breaks out of the container and can
// expand edge-to-edge fullscreen with a spring layout animation.
function NeuralBreakout({
  videoId,
  nodes,
  edges,
  segments,
  onSeek,
}: {
  videoId: string
  nodes?: GraphNode[]
  edges?: { source: string; target: string; weight?: number }[]
  segments?: Segment[]
  onSeek?: (seconds: number) => void
}) {
  const [fullscreen, setFullscreen] = useState(false)
  const reduced = usePrefersReducedMotion()

  const spring = {
    type: 'spring' as const,
    stiffness: 280,
    damping: 30,
    mass: 1,
  }

  return (
    <motion.div
      layout
      transition={reduced ? transitions.micro : spring}
      className={`relative overflow-hidden rounded-2xl border border-black/10 bg-white/60 shadow-card dark:border-white/10 dark:bg-stone-900/70 ${
        fullscreen ? 'fixed inset-0 z-50 rounded-none border-0' : ''
      }`}
      style={{ height: fullscreen ? '100dvh' : 'calc(100dvh - 8rem)' }}
    >
      <NeuralNavigator videoId={videoId} nodes={nodes} edges={edges} segments={segments} onSeek={onSeek} />

      <button
        type="button"
        onClick={() => setFullscreen((v) => !v)}
        aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        className={`absolute right-3 top-3 z-20 grid place-items-center transition-all duration-200 ease-out ${
          fullscreen
            ? 'h-10 w-10 rounded-xl bg-gradient-to-r from-[#2BA6A0] to-[#C17EF9] text-white shadow-[0_0_20px_rgb(43_166_160/0.45)] hover:shadow-[0_0_28px_rgb(193_126_249/0.5)]'
            : 'h-9 w-9 rounded-lg border border-black/10 bg-white/80 text-stone-600 backdrop-blur-md hover:bg-[#2BA6A0] hover:text-white dark:border-white/10 dark:bg-stone-800/80 dark:text-stone-300'
        }`}
      >
        {fullscreen ? <Minimize2 size={fullscreen ? 17 : 16} /> : <Maximize2 size={16} />}
      </button>
    </motion.div>
  )
}
