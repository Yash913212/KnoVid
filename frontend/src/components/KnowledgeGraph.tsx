import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Network, type Options } from 'vis-network'
import { DataSet } from 'vis-data'
import type { Node, Edge } from 'vis-network'
import type { GraphNode as GNode, GraphEdge as GEdge } from '../api/graphs'
import { formatTime } from '../utils'
import { DURATION_MS, tw, usePrefersReducedMotion } from '../lib/motion'
import { useTheme } from '../context/ThemeContext'

// ─── Depth ordering for staggered entrance ─────────────────────────
// BFS from root nodes (nodes with no incoming edges), grouped by depth
// so the stagger follows connection order, not array index.
function computeDepthOrder(nodes: GNode[], edges: GEdge[]): { order: string[]; depthOf: Map<string, number> } {
  const forwardAdj = new Map<string, string[]>()
  const hasIncoming = new Set<string>()

  for (const n of nodes) forwardAdj.set(n.id, [])
  for (const e of edges) {
    const adj = forwardAdj.get(e.source) || []
    adj.push(e.target)
    forwardAdj.set(e.source, adj)
    hasIncoming.add(e.target)
  }

  const roots = nodes.filter((n) => !hasIncoming.has(n.id)).map((n) => n.id)
  const depth = new Map<string, number>()
  const queue: [string, number][] =
    roots.length > 0 ? roots.map((r) => [r, 0] as [string, number]) : nodes.map((n) => [n.id, 0])

  for (const [id, d] of queue) depth.set(id, d)

  let i = 0
  while (i < queue.length) {
    const [nodeId, d] = queue[i++]
    for (const childId of forwardAdj.get(nodeId) || []) {
      if (!depth.has(childId)) {
        depth.set(childId, d + 1)
        queue.push([childId, d + 1])
      }
    }
  }

  const byDepth = new Map<number, string[]>()
  for (const n of nodes) {
    const d = depth.get(n.id) ?? 0
    const arr = byDepth.get(d) || []
    arr.push(n.id)
    byDepth.set(d, arr)
  }

  const order: string[] = []
  const depthOf = new Map<string, number>()
  for (const [d, ids] of Array.from(byDepth.entries()).sort(([a], [b]) => a - b)) {
    for (const id of ids) {
      order.push(id)
      depthOf.set(id, d)
    }
  }
  return { order, depthOf }
}

const TYPE_COLORS: Record<string, string> = {
  topic: '#7fb69e',
  keyword: '#c9a063',
  entity: '#8cb7a5',
  chapter: '#6aa18a',
}

const BASE_EDGE_COLOR = '#6b8176'
const HIGHLIGHT_COLOR = '#c9a063'
const DEFAULT_EDGE_WIDTH = 1.5

interface Props {
  graphNodes: GNode[]
  graphEdges: GEdge[]
  onSeek: (seconds: number) => void
}

export default function KnowledgeGraph({ graphNodes, graphEdges, onSeek }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const networkRef = useRef<Network | null>(null)
  const reduced = usePrefersReducedMotion()
  const { theme } = useTheme()
  const labelColor = theme === 'dark' ? '#cbd7d1' : '#1b2620'
  const [selectedNode, setSelectedNode] = useState<GNode | null>(null)

  useEffect(() => {
    if (!containerRef.current || graphNodes.length === 0) return

    const nodeById = new Map(graphNodes.map((node) => [node.id, node] as const))
    const connectedEdges = new Map<string, number[]>()
    for (const [index, edge] of graphEdges.entries()) {
      connectedEdges.set(edge.source, [...(connectedEdges.get(edge.source) || []), index])
      connectedEdges.set(edge.target, [...(connectedEdges.get(edge.target) || []), index])
    }

    // Start nodes/edges invisible; they fade in depth-order after the
    // physics layout settles. Node opacity is a top-level option, so the
    // whole node (circle + label) fades as one.
    const visNodes = new DataSet<Node>(
      graphNodes.map((n) => {
        const c = TYPE_COLORS[n.type] || '#6b8176'
        return {
          id: n.id,
          label: n.label,
          title: n.timestampRef != null ? `@ ${formatTime(n.timestampRef)}` : '',
          opacity: reduced ? 1 : 0,
          color: {
            background: c,
            border: c,
            highlight: { background: c, border: c },
            hover: { background: c, border: c },
          },
          font: { size: 12, color: labelColor },
          borderWidth: 1,
          size: n.type === 'topic' ? 25 : n.type === 'entity' ? 20 : 15,
        }
      })
    )

    const visEdges = new DataSet<Edge>(
      graphEdges.map((e, i) => ({
        id: i,
        from: e.source,
        to: e.target,
        label: e.relation,
        arrows: { to: { enabled: true, scaleFactor: 0.5 } },
        color: {
          color: BASE_EDGE_COLOR,
          opacity: reduced ? 1 : 0,
          hover: HIGHLIGHT_COLOR,
          highlight: HIGHLIGHT_COLOR,
        },
        width: reduced ? DEFAULT_EDGE_WIDTH : 0,
        font: { size: 10, color: '#879c92', strokeWidth: 0 },
        smooth: { enabled: true, type: 'continuous', roundness: 0.5 },
      }))
    )

    // `animationDuration` is valid at runtime but missing from the
    // published types — it's what makes DataSet updates animate.
    const networkOptions = {
      physics: {
        solver: 'forceAtlas2Based',
        forceAtlas2Based: { gravitationalConstant: -40, centralGravity: 0.005, springLength: 120 },
        stabilization: { iterations: 100, enabled: true },
      },
      interaction: {
        hover: true,
        tooltipDelay: 200,
        navigationButtons: true,
        keyboard: { enabled: true },
        hoverContinuous: { enabled: true, delay: 150 },
      },
      layout: { improvedLayout: false },
      nodes: {
        shape: 'dot',
        scaling: { min: 10, max: 30 },
        animationDuration: reduced ? 0 : DURATION_MS.micro,
        hoverWidth: 2,
        borderWidth: 1,
      },
      edges: {
        animationDuration: reduced ? 0 : DURATION_MS.content,
        hoverWidth: 3,
      },
    } as unknown as Options

    const network = new Network(
      containerRef.current,
      { nodes: visNodes, edges: visEdges },
      networkOptions
    )

    const timeoutIds: ReturnType<typeof setTimeout>[] = []

    // Click a node: camera pans+zooms to it, detail panel opens, seek to time
    network.on('click', (params) => {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0] as string
        const node = graphNodes.find((n) => n.id === nodeId)
        network.focus(nodeId, {
          scale: 1.6,
          animation: reduced ? false : { duration: DURATION_MS.graphFit, easingFunction: 'easeInOutQuad' },
        })
        if (node) {
          setSelectedNode(node)
          if (node.timestampRef != null) onSeek(node.timestampRef)
        }
      } else {
        setSelectedNode(null)
      }
    })

    // ── Hover: scale the node, thicken connected edges, dim everything else ──
    const originalEdgeProps = new Map<number, { width: number; opacity: number; color: string }>()
    const originalNodeProps = new Map<string, { borderWidth: number }>()
    const originalDimEdges = new Map<number, { width: number; opacity: number }>()
    const originalDimNodes = new Map<string, { opacity: number }>()
    const originalNodeSizes = new Map<string, number>()
    let hoveredNodeId: string | null = null
    let neighborHighlightTimer: ReturnType<typeof setTimeout> | null = null

    const restoreAllHover = () => {
      for (const [id, o] of originalEdgeProps) visEdges.update({ id, width: o.width, color: { color: o.color, opacity: o.opacity } })
      originalEdgeProps.clear()
      for (const [id, o] of originalNodeProps) visNodes.update({ id, borderWidth: o.borderWidth })
      originalNodeProps.clear()
      for (const [id, o] of originalDimEdges) visEdges.update({ id, width: o.width, color: { color: BASE_EDGE_COLOR, opacity: o.opacity } })
      originalDimEdges.clear()
      for (const [id, o] of originalDimNodes) visNodes.update({ id, opacity: o.opacity })
      originalDimNodes.clear()
      for (const [id, s] of originalNodeSizes) visNodes.update({ id, size: s })
      originalNodeSizes.clear()
    }

    const highlightConnected = (nodeId: string) => {
      restoreAllHover()

      for (const id of connectedEdges.get(nodeId) || []) {
        const edge = visEdges.get(id)
        if (!edge) continue
        const colorOpts = (edge.color as { opacity?: number; color?: string }) ?? {}
        originalEdgeProps.set(id, {
          width: (edge.width as number) ?? DEFAULT_EDGE_WIDTH,
          opacity: colorOpts.opacity ?? 1,
          color: colorOpts.color ?? BASE_EDGE_COLOR,
        })
        visEdges.update({ id, width: 3, color: { color: HIGHLIGHT_COLOR, opacity: 1, hover: HIGHLIGHT_COLOR, highlight: HIGHLIGHT_COLOR } })
      }

      const neighbors = new Set<string>()
      for (const edgeId of connectedEdges.get(nodeId) || []) {
        const edge = visEdges.get(edgeId)
        if (!edge) continue
        if (edge.from === nodeId) neighbors.add(edge.to as string)
        if (edge.to === nodeId) neighbors.add(edge.from as string)
      }
      for (const nid of neighbors) {
        const c = TYPE_COLORS[nodeById.get(nid)?.type ?? ''] ?? '#6b8176'
        if (!originalNodeProps.has(nid)) originalNodeProps.set(nid, { borderWidth: 1 })
        visNodes.update({ id: nid, borderWidth: 3, color: { border: c } })
      }

      // Scale the hovered node up ~1.1x
      const hovered = visNodes.get(nodeId)
      if (hovered) {
        const baseSize = (hovered.size as number) ?? 15
        originalNodeSizes.set(nodeId, baseSize)
        visNodes.update({ id: nodeId, size: baseSize * 1.1 })
      }

      // Dim unconnected edges + nodes to 30% opacity
      const connectedSet = new Set(connectedEdges.get(nodeId) || [])
      for (const id of visEdges.getIds()) {
        const edgeId = Number(id)
        const e = visEdges.get(edgeId)
        if (!e || connectedSet.has(edgeId)) continue
        const colorOpts = (e.color as { opacity?: number }) ?? {}
        if (!originalDimEdges.has(edgeId)) {
          originalDimEdges.set(edgeId, { width: (e.width as number) ?? DEFAULT_EDGE_WIDTH, opacity: colorOpts.opacity ?? 1 })
        }
        visEdges.update({ id: edgeId, color: { color: BASE_EDGE_COLOR, opacity: 0.3 } })
      }
      for (const id of visNodes.getIds()) {
        const nid = String(id)
        if (nid === hoveredNodeId || neighbors.has(nid)) continue
        const n = visNodes.get(nid)
        if (!n) continue
        if (!originalDimNodes.has(nid)) originalDimNodes.set(nid, { opacity: (n.opacity as number) ?? 1 })
        visNodes.update({ id: nid, opacity: 0.3 })
      }
    }

    network.on('hoverNode', (params) => {
      hoveredNodeId = params.node as string
      if (neighborHighlightTimer) clearTimeout(neighborHighlightTimer)
      highlightConnected(hoveredNodeId)
    })

    network.on('blurNode', () => {
      if (neighborHighlightTimer) clearTimeout(neighborHighlightTimer)
      const was = hoveredNodeId
      hoveredNodeId = null
      neighborHighlightTimer = setTimeout(() => {
        if (was) restoreAllHover()
      }, 120)
    })

    // ── Staggered entrance after physics settles ──────────────────
    network.on('stabilizationIterationsDone', () => {
      network.setOptions({ physics: { enabled: false } })
      network.fit({ animation: reduced ? false : { duration: DURATION_MS.graphFit, easingFunction: 'easeInOutQuad' } })

      if (reduced) return

      timeoutIds.push(
        setTimeout(() => {
          const { order, depthOf } = computeDepthOrder(graphNodes, graphEdges)
          let maxDepth = 0
          let maxGroupSize = 0
          const depthGroups = new Map<number, string[]>()
          for (const id of order) {
            const d = depthOf.get(id) ?? 0
            maxDepth = Math.max(maxDepth, d)
            const arr = depthGroups.get(d) || []
            arr.push(id)
            depthGroups.set(d, arr)
            maxGroupSize = Math.max(maxGroupSize, arr.length)
          }

          // Fade nodes in depth-by-depth (connection order), then within each depth
          for (const [d, ids] of Array.from(depthGroups.entries()).sort(([a], [b]) => a - b)) {
            ids.forEach((nodeId, within) => {
              timeoutIds.push(
                setTimeout(() => {
                  visNodes.update({ id: nodeId, opacity: 1 })
                }, d * DURATION_MS.staggerDelay * 2 + within * DURATION_MS.staggerDelay)
              )
            })
          }

          // Edge draw-in after nodes are all visible
          const nodeDelay =
            maxDepth * DURATION_MS.staggerDelay * 2 + maxGroupSize * DURATION_MS.staggerDelay + 120
          timeoutIds.push(
            setTimeout(() => {
              visEdges.update(
                graphEdges.map((_, i) => ({
                  id: i,
                  width: DEFAULT_EDGE_WIDTH,
                  color: { opacity: 1 },
                }))
              )
            }, nodeDelay)
          )
        }, 60)
      )
    })

    networkRef.current = network

    return () => {
      if (neighborHighlightTimer) clearTimeout(neighborHighlightTimer)
      for (const t of timeoutIds) clearTimeout(t)
      network.destroy()
      networkRef.current = null
    }
  }, [graphNodes, graphEdges, onSeek, reduced, labelColor, theme])

  if (graphNodes.length === 0) {
    return (
      <div style={{ height: 500 }} className="rounded-lg flex items-center justify-center text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2">
        No graph data available
      </div>
    )
  }

  return (
    <div className="relative">
      <div
        ref={containerRef}
        tabIndex={0}
        aria-label="Knowledge graph — use mouse or touch to pan and zoom"
        style={{ height: 500 }}
        className={`rounded-lg ${tw.surface} knovid-graph focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2`}
      />
      <AnimatePresence>
        {selectedNode && (
          <motion.aside
            key={selectedNode.id}
            role="dialog"
            aria-label="Node details"
            initial={{ x: 44, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 44, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            className="absolute right-3 top-3 z-10 w-60 rounded-2xl border border-white/10 bg-stone-900/95 p-4 text-stone-100 shadow-xl backdrop-blur-xl"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                {selectedNode.type}
              </span>
              <button
                type="button"
                onClick={() => setSelectedNode(null)}
                aria-label="Close node details"
                className="rounded-md p-1 text-stone-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" /></svg>
              </button>
            </div>
            <h4 className="font-display text-sm font-bold leading-snug text-white">{selectedNode.label}</h4>
            {(() => {
              const meta = selectedNode.metadata as { entityType?: unknown } | undefined
              const entityType = meta?.entityType
              return typeof entityType === 'string' && entityType ? (
                <p className="mt-1 text-xs text-stone-400">Type: {entityType}</p>
              ) : null
            })()}
            {selectedNode.timestampRef != null && (
              <button
                type="button"
                onClick={() => onSeek(selectedNode.timestampRef!)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-500"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86a1 1 0 0 0-1.5.86z" /></svg>
                Play from {formatTime(selectedNode.timestampRef)}
              </button>
            )}
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  )
}
