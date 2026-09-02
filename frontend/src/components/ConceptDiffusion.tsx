import { memo, useMemo, useRef, useState } from 'react'
import type { Segment } from '../api/transcripts'
import type { GraphNode } from '../api/graphs'
import { usePlayhead } from '../lib/playhead'
import { formatTime } from '../utils'
import { tw } from '../lib/motion'

interface ConceptDiffusionProps {
  segments: Segment[]
  nodes: GraphNode[]
  duration: number
  onSeek: (seconds: number) => void
}

const BIN_COUNT = 48
const LANE_H = 44
const LANE_GAP = 10
const PAD_TOP = 10
const MAX_CONCEPTS = 8

const TYPE_COLOR: Record<string, string> = {
  keyword: '#2BA6A0',
  entity: '#C17EF9',
  topic: '#D4A34A',
}

type Concept = { id: string; label: string; type: string; time: number; total: number; series: number[] }

// ─── Timeline Concept Diffusion Map ───────────────────────────────
// Where do the video's key concepts live, and how do they ebb and flow
// over time? For each significant concept this renders a lane whose
// height is the density of mentions in each time bin — a "heat map" of
// idea presence across the whole video. Click any lane to jump there.

function buildLanes(segments: Segment[], nodes: GraphNode[], duration: number): Concept[] {
  const bucketLabels = new Map<string, string>()
  for (const n of nodes) {
    if ((n.type === 'keyword' || n.type === 'entity' || n.type === 'topic') && n.label.trim().length > 1) {
      bucketLabels.set(n.label.toLowerCase(), n.type)
    }
  }
  if (bucketLabels.size === 0) return []

  // Count how many segments mention each concept (for ranking).
  const mentionCount = new Map<string, number>()
  for (const s of segments) {
    const lower = s.text.toLowerCase()
    for (const label of bucketLabels.keys()) {
      if (lower.includes(label)) mentionCount.set(label, (mentionCount.get(label) ?? 0) + 1)
    }
  }

  const binCount = Math.max(8, Math.min(BIN_COUNT, segments.length))
  const maxTime = Math.max(duration, segments[segments.length - 1]?.end ?? 0, 1)
  const binSize = maxTime / binCount

  const concepts: Concept[] = []
  for (const n of nodes) {
    const label = n.label
    const lower = label.toLowerCase()
    const type = bucketLabels.get(lower)
    if (!type) continue

    const series = new Array<number>(binCount).fill(0)
    let total = 0
    for (const s of segments) {
      if (!s.text.toLowerCase().includes(lower)) continue
      const bin = Math.min(binCount - 1, Math.floor(((s.start + s.end) / 2) / binSize))
      series[bin] += 1
      total += 1
    }
    if (total === 0) continue

    const peak = Math.max(...series, 1)
    concepts.push({
      id: n.id,
      label,
      type,
      time: n.timestampRef ?? segments.find((s) => s.text.toLowerCase().includes(lower))?.start ?? 0,
      total,
      series: series.map((v) => v / peak),
    })
  }

  concepts.sort((a, b) => b.total - a.total)
  return concepts.slice(0, MAX_CONCEPTS)
}

function pathFrom(series: number[], width: number, height: number, yCenter: number): string {
  const step = width / (series.length - 1)
  let d = `M0,${yCenter}`
  series.forEach((v, i) => {
    d += ` L${i * step},${yCenter - v * height}`
  })
  d += ` L${width},${yCenter} Z`
  return d
}

function ConceptDiffusion({ segments, nodes, duration, onSeek }: ConceptDiffusionProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<{ x: number; label: string; time: number } | null>(null)
  const playhead = usePlayhead()

  const lanes = useMemo(
    () => buildLanes(segments, nodes, duration),
    [segments, nodes, duration]
  )

  if (lanes.length === 0) return null

  const maxTime = Math.max(duration, segments[segments.length - 1]?.end ?? 0, 1)
  const W = 1000
  const H = PAD_TOP + lanes.length * (LANE_H + LANE_GAP)
  const setHoverByEvent = (e: React.MouseEvent<HTMLElement>) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * W
    const time = (x / W) * maxTime
    const laneIndex = Math.floor((e.clientY - rect.top) / rect.height * lanes.length)
    const lane = lanes[Math.max(0, Math.min(lanes.length - 1, laneIndex))]
    setHover({ x, label: lane.label, time })
  }

  return (
    <section
      className={`shine-card rounded-3xl p-5 ${tw.surface}`}
      aria-label="Concept diffusion map"
      onMouseMove={setHoverByEvent}
      onMouseLeave={() => setHover(null)}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-400 dark:text-[#737373]">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2BA6A0" strokeWidth="2" strokeLinecap="round">
            <path d="M3 12h4l2-7 4 14 2-7h6" />
          </svg>
          Concept diffusion
        </p>
        <span className="font-mono text-[10px] text-stone-400 dark:text-stone-500">
          {hover ? `${hover.label} · ${formatTime(hover.time)}` : 'Click any lane to jump in time'}
        </span>
      </div>

      <div className="overflow-x-auto">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full min-w-[560px] select-none"
          role="img"
          aria-label="Concept mention density over the video timeline"
          onClick={(e) => {
            const svg = svgRef.current
            if (!svg) return
            const rect = svg.getBoundingClientRect()
            const x = ((e.clientX - rect.left) / rect.width) * W
            onSeek((x / W) * maxTime)
          }}
        >
          <defs>
            <linearGradient id="diff-accent" x1="0" x2="1">
              <stop offset="0" stopColor="#2BA6A0" />
              <stop offset="0.5" stopColor="#C17EF9" />
              <stop offset="1" stopColor="#D4A34A" />
            </linearGradient>
          </defs>

          {/* Time ruler */}
          {Array.from({ length: 7 }).map((_, i) => {
            const x = (i / 6) * W
            return (
              <g key={`ruler-${i}`}>
                <line x1={x} x2={x} y1={0} y2={H} stroke="currentColor" strokeOpacity="0.06" strokeDasharray="3 3" />
                <text x={x + 2} y={H - 2} className="fill-stone-400 dark:fill-stone-500" fontSize="9" fontFamily="monospace">
                  {formatTime((i / 6) * maxTime)}
                </text>
              </g>
            )
          })}

          {lanes.map((lane, i) => {
            const y = PAD_TOP + i * (LANE_H + LANE_GAP)
            const color = TYPE_COLOR[lane.type] ?? '#2BA6A0'
            const fill = lane.type === 'entity' ? 'url(#diff-accent)' : color
            return (
              <g key={lane.id}>
                <line x1={0} x2={W} y1={y} y2={y} stroke="currentColor" strokeOpacity="0.08" />
                <path d={pathFrom(lane.series, W, LANE_H - 4, y + (LANE_H - 4) / 2)} fill={fill} fillOpacity="0.32" />
                <path d={pathFrom(lane.series, W, LANE_H - 4, y + (LANE_H - 4) / 2)} fill="none" stroke={color} strokeOpacity="0.85" strokeWidth="1.6" />
                <text x={8} y={y + (LANE_H - 4) / 2 + 3} className="fill-stone-500 dark:fill-stone-400" fontSize="11" fontWeight="600">
                  {lane.label}
                  <tspan className="fill-stone-400" fontSize="9" dx="6">{lane.type} · {lane.total}</tspan>
                </text>
              </g>
            )
          })}

          {/* Live playhead */}
          {playhead > 0 && playhead <= maxTime && (
            <line
              x1={(playhead / maxTime) * W}
              x2={(playhead / maxTime) * W}
              y1={0}
              y2={H}
              stroke="#C17EF9"
              strokeWidth="1.2"
              strokeOpacity="0.9"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* Hover marker */}
          {hover && (
            <line
              x1={hover.x}
              x2={hover.x}
              y1={0}
              y2={H}
              stroke="#2BA6A0"
              strokeWidth="1"
              strokeOpacity="0.55"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
      </div>
    </section>
  )
}

export default memo(ConceptDiffusion)