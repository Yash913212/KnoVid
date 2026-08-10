import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  ReactFlow,
  ReactFlowProvider,
  Handle,
  Position,
  MarkerType,
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
  type EdgeProps,
  type NodeTypes,
  type EdgeTypes,
  type OnNodeDrag,
  type NodeMouseHandler,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ZoomIn, ZoomOut, Maximize, Play, X, Sparkles, Copy, Check, MousePointer2, RotateCcw } from 'lucide-react'
import type { GraphNode } from '../api/graphs'
import type { Segment } from '../api/transcripts'
import { fuseConcepts, type FuseResult } from '../api/generate'
import { formatTime } from '../utils'

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// ─── Data model ────────────────────────────────────────────────────────

export type NavSnippet = {
  time: number
  speaker: string
  text: string
}

export type NavConcept = {
  id: string
  label: string
  weight: number // 0..1 → drives the temporal heatmap ring (thickness + glow)
  mentions: number
  speakers: string[]
  speakerMentions: Record<string, number>
  firstMention: number
  snippets: NavSnippet[]
}

export type NavLink = {
  source: string
  target: string
  weight: number
}

type ConceptFlowNode = Node<NavConcept, 'concept'>
type NavFlowEdge = Edge<{ weight?: number }, 'thought'>

// ─── Props ─────────────────────────────────────────────────────────────

export interface NeuralNavigatorProps {
  videoId: string
  nodes?: GraphNode[]
  edges?: { source: string; target: string; weight?: number }[]
  segments?: Segment[]
  onSeek?: (seconds: number) => void
}

// ─── Entry — composes the whole experience ─────────────────────────────

export default function NeuralNavigator({ videoId, nodes, edges, segments, onSeek }: NeuralNavigatorProps) {
  const concepts = useMemo(() => {
    if (!nodes || nodes.length === 0) return []
    return buildConcepts(nodes, segments ?? [])
  }, [nodes, segments])

  const links = useMemo(() => {
    if (!nodes || nodes.length === 0) return []
    const ids = new Set(concepts.map((c) => c.id))
    return (edges ?? [])
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => ({ source: e.source, target: e.target, weight: Math.min(1, Math.max(0.15, e.weight ?? 0.5)) }))
  }, [nodes, edges, concepts])

  if (concepts.length === 0) {
    return (
      <div className="neural-navigator grid h-full min-h-[560px] w-full place-items-center rounded-3xl border border-black/10 dark:border-white/10">
        <div className="max-w-xs px-6 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[#FF6B35] to-[#D946EF] text-white shadow-[0_0_24px_rgb(217_70_239/0.5)]">
            <Sparkles size={20} />
          </span>
          <p className="font-display mt-4 text-sm font-bold text-stone-700 dark:text-stone-200">No knowledge graph yet</p>
          <p className="mt-1.5 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
            Import a video and let the pipeline map its concepts — this canvas fills itself.
          </p>
        </div>
      </div>
    )
  }

  return (
    <ReactFlowProvider>
      <SpatialCanvas videoId={videoId} concepts={concepts} links={links} onSeek={onSeek} />
    </ReactFlowProvider>
  )
}

function buildConcepts(nodes: GraphNode[], segments: Segment[]): NavConcept[] {
  const lowered = segments.map((s) => s.text.toLowerCase())
  const counts = nodes.map((n) => {
    const manual = typeof n.metadata?.mentions === 'number' ? (n.metadata.mentions as number) : 0
    const term = n.label.toLowerCase()
    const fromText = lowered.reduce((acc, t) => acc + (t.includes(term) ? 1 : 0), 0)
    return { id: n.id, count: Math.max(manual, fromText) }
  })
  const max = Math.max(1, ...counts.map((c) => c.count))
  return nodes.map((n) => {
    const term = n.label.toLowerCase()
    const snips = segments
      .filter((s) => s.text.toLowerCase().includes(term))
      .slice(0, 6)
      .map((s) => ({ time: s.start, speaker: s.speaker || 'Speaker', text: s.text }))
    const speakerMentions: Record<string, number> = {}
    for (const sn of snips) speakerMentions[sn.speaker] = (speakerMentions[sn.speaker] ?? 0) + 1
    const mentions = counts.find((c) => c.id === n.id)?.count ?? snips.length
    return {
      id: n.id,
      label: n.label,
      weight: Math.min(1, Math.max(0.2, mentions / max)),
      mentions,
      speakers: Object.keys(speakerMentions),
      speakerMentions,
      firstMention: snips[0]?.time ?? n.timestampRef ?? 0,
      snippets: snips,
    }
  })
}

function circularPositions(count: number, radius = 240): { x: number; y: number }[] {
  return Array.from({ length: count }, (_, i) => {
    const ang = (i / count) * Math.PI * 2 - Math.PI / 2
    return { x: Math.round(Math.cos(ang) * radius - 70), y: Math.round(Math.sin(ang) * radius - 20) }
  })
}

// ─── 1. SpatialCanvas — the main view ──────────────────────────────────

const nodeTypes = { concept: ConceptNode } satisfies NodeTypes
const edgeTypes = { thought: ThoughtEdge } satisfies EdgeTypes

function SpatialCanvas({
  videoId,
  concepts,
  links,
  onSeek,
}: {
  videoId: string
  concepts: NavConcept[]
  links: NavLink[]
  onSeek?: (seconds: number) => void
}) {
  const { zoomIn, zoomOut, fitView } = useReactFlow()

  const initialNodes = useMemo<ConceptFlowNode[]>(
    () =>
      concepts.map((c, i) => ({
        id: c.id,
        type: 'concept' as const,
        position: circularPositions(concepts.length)[i],
        data: c,
      })),
    [concepts]
  )
  const initialEdges = useMemo<NavFlowEdge[]>(
    () =>
      links.map((l) => ({
        id: `${l.source}→${l.target}`,
        source: l.source,
        target: l.target,
        type: 'thought' as const,
        data: { weight: l.weight },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#D946EF', width: 14, height: 14 },
      })),
    [links]
  )

  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<ConceptFlowNode>(initialNodes)
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState<NavFlowEdge>(initialEdges)

  // Re-sync when the underlying data changes (e.g. translation refresh).
  useEffect(() => {
    setFlowNodes(initialNodes)
  }, [initialNodes, setFlowNodes])
  useEffect(() => {
    setFlowEdges(initialEdges)
  }, [initialEdges, setFlowEdges])

  const [inspected, setInspected] = useState<NavConcept | null>(null)
  const [fuseQueue, setFuseQueue] = useState<string[]>([])
  const [fusion, setFusion] = useState<{ a: NavConcept; b: NavConcept } | null>(null)
  const [dragNear, setDragNear] = useState(false)
  const zoneRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (fuseQueue.length < 2) return
    const a = concepts.find((c) => c.id === fuseQueue[0])
    const b = concepts.find((c) => c.id === fuseQueue[1])
    if (a && b) setFusion({ a, b })
    setFuseQueue([])
  }, [fuseQueue, concepts])

  const isNearZone = useCallback((x: number, y: number) => {
    const r = zoneRef.current?.getBoundingClientRect()
    if (!r) return false
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    return Math.hypot(x - cx, y - cy) <= r.width * 0.62 + 36
  }, [])

  type PointerLike = {
    clientX?: number
    clientY?: number
    touches?: readonly { clientX: number; clientY: number }[]
    changedTouches?: readonly { clientX: number; clientY: number }[]
  }
  const pointerXY = (e: unknown) => {
    const ev = e as PointerLike
    if (typeof ev.clientX === 'number' && typeof ev.clientY === 'number') return { x: ev.clientX, y: ev.clientY }
    const t = ev.touches?.[0] ?? ev.changedTouches?.[0]
    return t ? { x: t.clientX, y: t.clientY } : { x: 0, y: 0 }
  }

  const onNodeDrag = useCallback<OnNodeDrag<ConceptFlowNode>>(
    (e) => {
      const { x, y } = pointerXY(e)
      setDragNear(isNearZone(x, y))
    },
    [isNearZone]
  )

  const onNodeDragStop = useCallback<OnNodeDrag<ConceptFlowNode>>(
    (e, node) => {
      const { x, y } = pointerXY(e)
      if (!isNearZone(x, y)) {
        setDragNear(false)
        return
      }
      setDragNear(false)
      setFuseQueue((q) => (q.includes(node.id) ? q : [...q, node.id]))
    },
    [isNearZone]
  )

  const onNodeClick = useCallback<NodeMouseHandler<ConceptFlowNode>>(
    (_e, node) => {
      const c = concepts.find((cc) => cc.id === node.id)
      if (c) setInspected(c)
    },
    [concepts]
  )

  const pending = fuseQueue[0] ? concepts.find((c) => c.id === fuseQueue[0])?.label : undefined

  return (
    <div className="neural-navigator relative h-full min-h-[560px] w-full overflow-hidden rounded-3xl border border-black/10 dark:border-white/10">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        fitView
        fitViewOptions={{ padding: 0.4, maxZoom: 1.35 }}
        minZoom={0.25}
        maxZoom={3}
        nodesConnectable={false}
        edgesFocusable={false}
        proOptions={{ hideAttribution: true }}
      />

      {/* Legend */}
      <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-xl border border-black/10 bg-white/70 px-3 py-2 backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.03]">
        <p className="font-display text-[10px] font-bold uppercase tracking-[0.24em] text-stone-500 dark:text-[#737373]">
          Neural Map
        </p>
        <div className="mt-1.5 flex items-center gap-3 text-[10px] font-medium text-stone-500 dark:text-[#737373]">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#FF6B35] shadow-[0_0_6px_rgb(255_107_53/0.8)]" />
            Concept
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-px w-3 bg-[#D946EF]" />
            Connection
          </span>
          <span className="flex items-center gap-1.5">
            <Sparkles size={10} className="text-[#D946EF]" />
            Fusion
          </span>
        </div>
      </div>

      {/* 3. NodeFusionZone — the AI interaction target */}
      <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
        <NodeFusionZone zoneRef={zoneRef} near={dragNear} pending={pending} armed={fuseQueue.length === 1} />
      </div>

      {/* Custom minimal zoom controls */}
      <ZoomControls
        onZoomIn={() => zoomIn({ duration: 200 })}
        onZoomOut={() => zoomOut({ duration: 200 })}
        onFit={() => fitView({ padding: 0.4, duration: 350 })}
      />

      {/* 4. ContextualInspector — right side panel */}
      <ContextualInspector concept={inspected} onClose={() => setInspected(null)} onSeek={onSeek} />

      {/* NodeFusionModal */}
      <NodeFusionModal fusion={fusion} videoId={videoId} onSeek={onSeek} onClose={() => setFusion(null)} />
    </div>
  )
}

// ─── 2. ConceptNode — the glass capsule with temporal heat ring ────────

function ConceptNode({ data, selected }: NodeProps<ConceptFlowNode>) {
  const thickness = 2 + Math.round(data.weight * 7)
  const glow = 0.28 + data.weight * 0.5
  return (
    <div className="group relative">
      <motion.div
        whileHover={{ scale: 1.07 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        className="relative"
      >
        {/* Tooltip: "Mentioned 14 times across 3 speakers" */}
        <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2.5 -translate-x-1/2 whitespace-nowrap rounded-lg border border-black/10 bg-white px-2.5 py-1 text-[10px] font-medium text-stone-600 opacity-0 shadow-lg backdrop-blur transition-opacity duration-200 group-hover:opacity-100 dark:border-white/10 dark:bg-[#0A0A0A] dark:text-stone-300">
          Mentioned {data.mentions} times across {data.speakers.length} speakers
        </div>

        {/* Temporal heatmap ring — thickness + glow scale with weight */}
        <div
          className="absolute -inset-2 rounded-full transition-all duration-300"
          style={{
            background:
              'conic-gradient(from 0deg, rgb(217 70 239 / 1) 0deg, rgb(217 70 239 / 0.25) 42deg, transparent 92deg, transparent 180deg, rgb(217 70 239 / 0.75) 214deg, transparent 264deg)',
            WebkitMask: `radial-gradient(farthest-side, transparent calc(100% - ${thickness}px), #000 calc(100% - ${thickness}px))`,
            mask: `radial-gradient(farthest-side, transparent calc(100% - ${thickness}px), #000 calc(100% - ${thickness}px))`,
            opacity: 0.5 + data.weight * 0.45,
            boxShadow: `0 0 ${Math.round(12 + data.weight * 30)}px rgb(217 70 239 / ${glow})`,
          }}
        />

        {/* Glass capsule */}
        <div
          className={`relative rounded-full border px-4 py-2.5 text-sm font-semibold backdrop-blur-xl transition-all duration-200 ${
            selected
              ? 'border-[#FF6B35]/70 bg-[#FF6B35]/10 text-[#C2410C] shadow-[0_0_36px_rgb(255_107_53/0.5)] dark:bg-[#FF6B35]/[0.14] dark:text-[#FFB58C]'
              : 'border-black/10 bg-white/80 text-stone-800 shadow-[0_4px_18px_rgb(0_0_0/0.06)] group-hover:border-[#FF6B35]/60 group-hover:shadow-[0_0_28px_rgb(255_107_53/0.35)] dark:border-white/15 dark:bg-white/[0.05] dark:text-[#F5F5F5] dark:group-hover:border-[#D946EF]/60 dark:group-hover:shadow-[0_0_28px_rgb(255_107_53/0.4)]'
          }`}
        >
          {data.label}
        </div>
      </motion.div>

      {/* Invisible connection handles (left/right) */}
      <Handle type="target" position={Position.Left} className="!h-0 !w-0 !border-0 !bg-transparent !opacity-0" />
      <Handle type="source" position={Position.Right} className="!h-0 !w-0 !border-0 !bg-transparent !opacity-0" />
    </div>
  )
}

// ─── Custom edges — animated Tangerine→Orchid thought flows ────────────

function ThoughtEdge({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps<NavFlowEdge>) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.28,
  })
  const weight = data?.weight ?? 0.5
  const gradId = useId().replace(/:/g, '')
  const showLabel = weight > 0.8

  return (
    <>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FF6B35" />
          <stop offset="55%" stopColor="#F97316" />
          <stop offset="100%" stopColor="#D946EF" />
        </linearGradient>
      </defs>
      <path d={path} fill="none" stroke={`url(#${gradId})`} strokeWidth={1 + weight * 2.2} opacity={0.35 + weight * 0.5} className="nav-edge-flow" markerEnd={markerEnd} />
      {/* Invisible fat stroke for easier selection */}
      <path d={path} fill="none" stroke="transparent" strokeWidth={14} />
      {showLabel && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            <span className="rounded-full border border-[#D946EF]/30 bg-[#D946EF]/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#A21CAF] backdrop-blur dark:border-[#D946EF]/30 dark:bg-[#D946EF]/[0.08] dark:text-[#E879F9]">
              {Math.round(weight * 100)}%
            </span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

// ─── Zoom controls (custom, Lucide icons) ──────────────────────────────

function ZoomControls({
  onZoomIn,
  onZoomOut,
  onFit,
}: {
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
}) {
  return (
    <div className="absolute bottom-4 left-4 z-10 flex flex-col overflow-hidden rounded-xl border border-black/10 bg-white/80 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-[#0A0A0A]/70">
      <IconBtn label="Zoom in" onClick={onZoomIn}>
        <ZoomIn size={14} />
      </IconBtn>
      <div className="h-px bg-black/10 dark:bg-white/10" />
      <IconBtn label="Zoom out" onClick={onZoomOut}>
        <ZoomOut size={14} />
      </IconBtn>
      <div className="h-px bg-black/10 dark:bg-white/10" />
      <IconBtn label="Fit view" onClick={onFit}>
        <Maximize size={14} />
      </IconBtn>
    </div>
  )
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-9 w-9 place-items-center text-stone-500 transition-colors hover:bg-[#FF6B35]/10 hover:text-[#EA580C] dark:text-stone-400 dark:hover:bg-[#D946EF]/10 dark:hover:text-[#FF8A5C]"
    >
      {children}
    </button>
  )
}

// ─── 3. NodeFusionZone — magnetic drop target ──────────────────────────

function NodeFusionZone({
  zoneRef,
  near,
  armed,
  pending,
}: {
  zoneRef: RefObject<HTMLDivElement | null>
  near: boolean
  armed: boolean
  pending?: string
}) {
  return (
    <div ref={zoneRef} className="relative grid h-56 w-56 place-items-center" aria-hidden="true">
      {/* Outer dashed orbit */}
      <motion.div
        className="absolute inset-0 rounded-full border border-dashed border-[#D946EF]/40"
        animate={
          near
            ? {
                scale: 1.16,
                borderColor: 'rgb(217 70 239 / 0.9)',
                boxShadow: '0 0 70px rgb(255 107 53 / 0.4), inset 0 0 50px rgb(217 70 239 / 0.2)',
              }
            : {
                scale: 1,
                borderColor: 'rgb(217 70 239 / 0.35)',
                boxShadow: '0 0 0 rgb(255 107 53 / 0)',
              }
        }
        transition={{ type: 'spring', stiffness: 220, damping: 18 }}
      />
      {/* Ambient glow disc */}
      <motion.div
        className="absolute inset-10 rounded-full bg-gradient-to-br from-[#FF6B35]/12 to-[#D946EF]/12 blur-xl"
        animate={near || armed ? { opacity: 1, scale: 1.1 } : { opacity: [0.6, 1, 0.6] }}
        transition={near || armed ? { duration: 0.25 } : { repeat: Infinity, duration: 3, ease: 'easeInOut' }}
      />
      {/* Core label */}
      <div className="relative grid place-items-center px-4 text-center">
        <motion.div
          animate={near ? { rotate: [0, -8, 8, 0] } : { rotate: 0 }}
          transition={{ duration: 0.3 }}
          className="grid place-items-center"
        >
          <Sparkles size={20} className="text-[#FF8A5C] dark:text-[#FF8A5C]" />
        </motion.div>
        <p className="font-display mt-1 text-[11px] font-black uppercase tracking-[0.22em] text-stone-600 dark:text-stone-300">
          Fuse Concepts
        </p>
        <p className="mt-1 max-w-[180px] text-[10px] leading-relaxed text-stone-400 dark:text-[#737373]">
          {near ? 'Release to fuse' : armed ? <>Pair with <span className="text-[#FF8A5C]">{pending}</span></> : 'Drag two ideas together'}
        </p>
      </div>
    </div>
  )
}

// ─── NodeFusionModal — LLM-grounded synthesis ──────────────────────────

function NodeFusionModal({
  fusion,
  videoId,
  onSeek,
  onClose,
}: {
  fusion: { a: NavConcept; b: NavConcept } | null
  videoId: string
  onSeek?: (seconds: number) => void
  onClose: () => void
}) {
  return (
    <AnimatePresence>
      {fusion && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.92, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 8 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            className="w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-[#0A0A0A]/95 shadow-[0_0_80px_rgb(217_70_239/0.25)]"
          >
            <FusionBody videoId={videoId} a={fusion.a} b={fusion.b} onSeek={onSeek} onClose={onClose} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function FusionBody({
  videoId,
  a,
  b,
  onSeek,
  onClose,
}: {
  videoId: string
  a: NavConcept
  b: NavConcept
  onSeek?: (seconds: number) => void
  onClose: () => void
}) {
  const [stage, setStage] = useState(0)
  const [phase, setPhase] = useState<'synth' | 'done'>('synth')
  const [result, setResult] = useState<FuseResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    setPhase('synth')
    setError(null)
    setResult(null)
    setStage(0)

    const t1 = setTimeout(() => setStage(1), 850)
    const t2 = setTimeout(() => setStage(2), 1750)

    const run = async () => {
      try {
        const [res] = await Promise.all([fuseConcepts(videoId, a.label, b.label), delay(2700)])
        if (cancelled) return
        setResult(res)
        setPhase('done')
      } catch {
        if (cancelled) return
        setError('Fusion failed — is the processing service reachable?')
        setPhase('done')
      }
    }
    run()

    return () => {
      cancelled = true
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [videoId, a.label, b.label, attempt])

  const steps = [
    'Reading speaker context for both concepts',
    'Cross-referencing shared transcript turns',
    'Synthesizing the connection from source moments',
  ]

  const copy = async () => {
    const body = result
      ? `${result.explanation}${result.citations.length ? `\n\nEvidence:\n${result.citations.map((c) => `[${formatTime(c.time)}] ${c.speaker}: ${c.text}`).join('\n')}` : ''}`
      : ''
    try {
      await navigator.clipboard.writeText(body)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {}
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-4">
        <div className="min-w-0">
          <p className="font-display text-[10px] font-bold uppercase tracking-[0.24em] text-[#FF8A5C]">Node Fusion</p>
          <h3 className="font-display mt-1 text-lg font-black leading-snug text-white">
            {phase === 'synth' ? (
              <>
                Synthesizing connection between{' '}
                <span className="gradient-ember">{a.label}</span> and{' '}
                <span className="gradient-ember">{b.label}</span>…
              </>
            ) : (
              <>
                <span className="gradient-ember">{a.label}</span> ↔{' '}
                <span className="gradient-ember">{b.label}</span>
              </>
            )}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close fusion modal"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-stone-300 transition-colors hover:border-[#D946EF]/50 hover:text-white"
        >
          <X size={14} />
        </button>
      </div>

      <div className="px-6 py-5">
        <AnimatePresence mode="wait">
          {phase === 'synth' ? (
            <motion.ol
              key="synth"
              className="space-y-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -6 }}
            >
              {steps.map((s, i) => {
                const reached = stage >= i
                const active = stage === i
                return (
                  <motion.li
                    key={s}
                    className="flex items-center gap-3 text-sm"
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.12 }}
                  >
                    <span
                      className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${
                        reached ? 'bg-gradient-to-br from-[#FF6B35] to-[#D946EF] text-white' : 'border border-white/15 text-stone-500'
                      }`}
                    >
                      {reached ? (
                        <Check size={11} strokeWidth={3} />
                      ) : active ? (
                        <span className="spin-ring absolute inset-0" />
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      )}
                    </span>
                    <span className={reached ? 'text-stone-200' : 'text-stone-500'}>{s}</span>
                  </motion.li>
                )
              })}
            </motion.ol>
          ) : (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
            >
              {error ? (
                <div className="rounded-2xl border border-[#FF6B35]/30 bg-[#FF6B35]/[0.06] p-4 text-sm text-stone-300">
                  <p className="font-semibold text-[#FF8A5C]">{error}</p>
                  <button
                    type="button"
                    onClick={() => setAttempt((n) => n + 1)}
                    className="mt-3 rounded-xl border border-[#FF6B35]/40 bg-[#FF6B35]/10 px-3 py-1.5 text-xs font-semibold text-[#FF8A5C] transition-colors hover:bg-[#FF6B35]/20"
                  >
                    <RotateCcw size={12} className="mr-1 inline-block" />
                    Retry fusion
                  </button>
                </div>
              ) : (
                result && (
                  <>
                    <div className="flex items-center gap-2">
                      <Sparkles size={14} className="text-[#FF8A5C]" />
                      <p className="font-display text-xs font-bold uppercase tracking-[0.2em] text-[#E879F9]">Connection mapped</p>
                    </div>
                    <p className="mt-3 whitespace-pre-line text-sm leading-7 text-stone-200">{result.explanation}</p>

                    {result.citations.length > 0 && (
                      <div className="mt-5">
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400">Source evidence</p>
                        <div className="space-y-2">
                          {result.citations.map((c, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => onSeek?.(c.time)}
                              className="group block w-full rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left transition-colors hover:border-[#D946EF]/50"
                            >
                              <div className="mb-1 flex items-center gap-2">
                                <span className="font-mono text-[10px] font-semibold text-[#FF8A5C]">{formatTime(c.time)}</span>
                                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-stone-400">
                                  {c.speaker || 'Speaker'}
                                </span>
                              </div>
                              <p className="text-xs leading-relaxed text-stone-400 group-hover:text-stone-200">{c.text}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        onClick={copy}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[#FF6B35]/40 bg-[#FF6B35]/10 px-3 py-1.5 text-xs font-semibold text-[#FF8A5C] transition-colors hover:bg-[#FF6B35]/20"
                      >
                        {copied ? <Check size={12} /> : <Copy size={12} />}
                        {copied ? 'Copied' : 'Copy insight'}
                      </button>
                      <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[#D946EF]/40 bg-[#D946EF]/10 px-3 py-1.5 text-xs font-semibold text-[#E879F9] transition-colors hover:bg-[#D946EF]/20"
                      >
                        <MousePointer2 size={12} />
                        Back to canvas
                      </button>
                    </div>
                  </>
                )
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─── 4. ContextualInspector — right side panel ─────────────────────────

function ContextualInspector({
  concept,
  onClose,
  onSeek,
}: {
  concept: NavConcept | null
  onClose: () => void
  onSeek?: (seconds: number) => void
}) {
  return (
    <AnimatePresence>
      {concept && (
        <motion.aside
          key={concept.id}
          role="complementary"
          aria-label={`${concept.label} inspector`}
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', stiffness: 280, damping: 32 }}
          className="absolute bottom-0 right-0 top-0 z-20 flex w-[min(380px,94%)] flex-col border-l border-black/10 bg-white/85 shadow-[0_0_60px_rgb(0_0_0/0.18)] backdrop-blur-2xl dark:border-white/10 dark:bg-[#0A0A0A]/85"
        >
          <div className="flex items-center justify-between border-b border-black/10 px-5 py-4 dark:border-white/10">
            <p className="font-display text-[10px] font-bold uppercase tracking-[0.24em] text-stone-400 dark:text-[#737373]">
              Concept Inspector
            </p>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close inspector"
              className="grid h-8 w-8 place-items-center rounded-full border border-black/10 bg-white/70 text-stone-500 transition-colors hover:border-[#D946EF]/50 hover:text-[#A21CAF] dark:border-white/10 dark:bg-white/[0.04] dark:text-stone-300 dark:hover:text-[#E879F9]"
            >
              <X size={14} />
            </button>
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
            <div>
              <h3 className="font-display gradient-ember text-2xl font-black leading-tight">{concept.label}</h3>
              <p className="mt-1.5 text-xs text-stone-500 dark:text-[#737373]">
                {concept.mentions} mentions · {concept.speakers.length} speakers · first at {formatTime(concept.firstMention)}
              </p>
            </div>

            <button
              type="button"
              onClick={() => onSeek?.(concept.firstMention)}
              className="btn-ember flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
            >
              <Play size={14} fill="currentColor" />
              Play First Mention
            </button>

            <section>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 dark:text-[#737373]">Speakers</p>
              <div className="flex flex-wrap gap-2">
                {concept.speakers.length ? (
                  concept.speakers.map((s, i) => (
                    <SpeakerPill key={s} name={s} count={concept.speakerMentions[s] ?? 0} tone={i % 2 === 0 ? 'tangerine' : 'orchid'} />
                  ))
                ) : (
                  <p className="text-xs text-stone-400 dark:text-stone-500">No speaker data</p>
                )}
              </div>
            </section>

            <section>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 dark:text-[#737373]">
                Transcript Slicer
              </p>
              <div className="space-y-2">
                {concept.snippets.length ? (
                  concept.snippets.map((sn, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => onSeek?.(sn.time)}
                      className="group block w-full rounded-xl border border-black/10 bg-white/60 p-3 text-left transition-colors hover:border-[#FF6B35]/50 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-[#D946EF]/50"
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <span className="font-mono text-[10px] font-semibold text-[#EA580C] dark:text-[#FF8A5C]">
                          {formatTime(sn.time)}
                        </span>
                        <span className="rounded bg-black/5 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-stone-500 dark:bg-white/10 dark:text-stone-400">
                          {sn.speaker}
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed text-stone-700 group-hover:text-stone-900 dark:text-stone-300 dark:group-hover:text-white">
                        <HighlightTerm text={sn.text} term={concept.label} />
                      </p>
                    </button>
                  ))
                ) : (
                  <p className="text-xs text-stone-400 dark:text-stone-500">No transcript mentions found.</p>
                )}
              </div>
            </section>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

function SpeakerPill({ name, count, tone }: { name: string; count: number; tone: 'tangerine' | 'orchid' }) {
  const tangerine = tone === 'tangerine'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium ${
        tangerine
          ? 'border-[#FF6B35]/40 bg-[#FF6B35]/10 text-[#C2410C] dark:border-[#FF6B35]/35 dark:bg-[#FF6B35]/[0.08] dark:text-[#FF8A5C]'
          : 'border-[#D946EF]/40 bg-[#D946EF]/10 text-[#A21CAF] dark:border-[#D946EF]/35 dark:bg-[#D946EF]/[0.08] dark:text-[#E879F9]'
      }`}
    >
      <span
        className={`grid h-4 w-4 place-items-center rounded-full text-[9px] font-black text-white ${tangerine ? 'bg-[#FF6B35]' : 'bg-[#D946EF]'}`}
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
      {name}
      {count > 0 && <span className="opacity-60">×{count}</span>}
    </span>
  )
}

function HighlightTerm({ text, term }: { text: string; term: string }) {
  const idx = text.toLowerCase().indexOf(term.toLowerCase())
  if (idx < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-[#FF6B35]/20 px-0.5 text-[#C2410C] dark:bg-[#FF6B35]/25 dark:text-[#FFB58C]">
        {text.slice(idx, idx + term.length)}
      </mark>
      {text.slice(idx + term.length)}
    </>
  )
}
