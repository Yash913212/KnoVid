import { useMemo, useCallback, useState, useEffect } from 'react'
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type NodeProps,
  type NodeChange,
  type EdgeChange,
  Handle,
  Position,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { GraphNode as GNode, GraphEdge as GEdge } from '../api/graphs'
import { formatTime } from '../utils'
import { DURATION_MS, tw } from '../lib/motion'

interface Props {
  graphNodes: GNode[]
  graphEdges: GEdge[]
  onSeek: (seconds: number) => void
}

const NODE_WIDTH = 160
const LEVEL_HEIGHT = 120
const LEVEL_WIDTH = 200
const FADE_MS = DURATION_MS.content

const TYPE_COLORS: Record<string, string> = {
  topic: '#7fb69e',
  keyword: '#c9a063',
  entity: '#8cb7a5',
  chapter: '#6aa18a',
}

interface NodeData {
  id: string
  label: string
  nodeType: string
  timestampRef: number | null
  onSeek?: (seconds: number) => void
  collapsed?: boolean
  childCount?: number
  onToggle?: (id: string) => void
}

function CustomNode({ data }: NodeProps) {
  const d = data as unknown as NodeData
  const color = TYPE_COLORS[d.nodeType] || '#6b8176'
  const ts = d.timestampRef
  const isTopic = d.nodeType === 'topic'

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={isTopic ? !d.collapsed : undefined}
      aria-label={isTopic ? `${d.label}, ${d.collapsed ? 'collapsed' : 'expanded'}` : d.label}
      className="rounded-lg shadow-sm border px-3 py-2 text-sm cursor-pointer hover:shadow-md transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
      style={{ borderColor: color, minWidth: NODE_WIDTH }}
      onClick={() => {
        if (isTopic) d.onToggle?.(d.id)
        else if (ts != null) d.onSeek?.(ts)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (isTopic) d.onToggle?.(d.id)
          else if (ts != null) d.onSeek?.(ts)
        }
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: color }} />
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
        <span className="font-medium truncate flex-1">{d.label}</span>
        {isTopic && d.collapsed && (d.childCount ?? 0) > 0 && (
          <span className="text-[10px] font-medium bg-gray-100 text-gray-500 rounded-full px-1.5 py-0.5 shrink-0">
            +{d.childCount}
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        {ts != null && (
          <button
            className="text-[10px] text-gray-400 hover:text-[#1D7773] transition-colors duration-150 ease-out font-mono"
            onClick={(e) => {
              e.stopPropagation()
              d.onSeek?.(ts)
            }}
            aria-label={`Jump to ${formatTime(ts)}`}
          >
            {formatTime(ts)}
          </button>
        )}
        {isTopic && <span className="text-[10px] text-gray-400">{d.collapsed ? '▸' : '▾'}</span>}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: color }} />
    </div>
  )
}

const nodeTypes = { custom: CustomNode }

export default function TopicTree({ graphNodes, graphEdges, onSeek }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [fadingOut, setFadingOut] = useState<Set<string>>(new Set())

  // Build children map once (stable across renders unless graphEdges change)
  const childrenOf = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const e of graphEdges) {
      if (e.relation === 'includes') {
        const list = m.get(e.source) || []
        list.push(e.target)
        m.set(e.source, list)
      }
    }
    return m
  }, [graphEdges])

  const toggleTopic = useCallback(
    (topicId: string) => {
      const kids = childrenOf.get(topicId) || []
      if (collapsed.has(topicId)) {
        setCollapsed((prev) => {
          const next = new Set(prev)
          next.delete(topicId)
          return next
        })
      } else {
        setFadingOut((prev) => {
          const next = new Set(prev)
          for (const k of kids) next.add(k)
          return next
        })
        setTimeout(() => {
          setFadingOut((prev) => {
            const next = new Set(prev)
            for (const k of kids) next.delete(k)
            return next
          })
          setCollapsed((prev) => new Set(prev).add(topicId))
        }, FADE_MS + 50)
      }
    },
    [collapsed, childrenOf]
  )

  const finalFlow = useMemo(() => {
    const fn: Node[] = []
    const fe: Edge[] = []

    const topics = graphNodes.filter((n) => n.type === 'topic')
    const keywords = graphNodes.filter((n) => n.type === 'keyword')
    const entities = graphNodes.filter((n) => n.type === 'entity')

    const placed = new Set<string>()
    let x = 0
    let y = 0

    for (const topic of topics) {
      if (placed.has(topic.id)) continue
      placed.add(topic.id)
      const isCollapsed = collapsed.has(topic.id)

      fn.push({
        id: topic.id,
        type: 'custom',
        position: { x, y },
        data: {
          id: topic.id,
          label: topic.label,
          nodeType: topic.type,
          timestampRef: topic.timestampRef,
          collapsed: isCollapsed,
          childCount: (childrenOf.get(topic.id) || []).length,
          onToggle: toggleTopic,
        },
      })

      const kids = childrenOf.get(topic.id) || []
      const kidStartX = x - ((kids.length - 1) * LEVEL_WIDTH) / 2

      for (let ki = 0; ki < kids.length; ki++) {
        const kidId = kids[ki]
        const kw = keywords.find((k) => k.id === kidId) || graphNodes.find((n) => n.id === kidId)
        if (!kw || placed.has(kidId)) continue
        placed.add(kidId)

        const hidden = isCollapsed && !fadingOut.has(kidId)
        const fading = fadingOut.has(kidId)

        fn.push({
          id: kidId,
          type: 'custom',
          position: { x: kidStartX + ki * LEVEL_WIDTH, y: y + LEVEL_HEIGHT },
          hidden,
          style: {
            opacity: fading ? 0 : hidden ? 0 : 1,
            transition: `opacity ${FADE_MS}ms ease-in-out`,
          },
          data: { id: kidId, label: kw.label, nodeType: kw.type, timestampRef: kw.timestampRef },
        })

        fe.push({
          id: `${topic.id}-${kidId}`,
          source: topic.id,
          target: kidId,
          type: 'smoothstep',
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { stroke: '#6b8176' },
        })
      }

      x += LEVEL_WIDTH
      if (x > 600) { x = 0; y += LEVEL_HEIGHT * 2.5 }
    }

    for (const entity of entities) {
      if (placed.has(entity.id)) continue
      placed.add(entity.id)
      fn.push({
        id: entity.id,
        type: 'custom',
        position: { x, y },
        data: { id: entity.id, label: entity.label, nodeType: entity.type, timestampRef: entity.timestampRef },
      })
      x += LEVEL_WIDTH
      if (x > 600) { x = 0; y += LEVEL_HEIGHT * 1.5 }
    }

    return { nodes: fn, edges: fe }
  }, [graphNodes, collapsed, fadingOut, childrenOf, toggleTopic])

  const [nodes, setNodes] = useState<Node[]>(finalFlow.nodes)
  const [edges, setEdges] = useState<Edge[]>(finalFlow.edges)

  useEffect(() => {
    setNodes(finalFlow.nodes)
    setEdges(finalFlow.edges)
  }, [finalFlow])

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds))
  }, [])
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds))
  }, [])

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const d = node.data as unknown as NodeData
      if (d.nodeType !== 'topic' && d.timestampRef != null) {
        onSeek(d.timestampRef)
      }
    },
    [onSeek]
  )

  return (
    <div style={{ height: 500 }} className={`rounded-lg ${tw.surface}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.3}
        maxZoom={2}
      >
        <Controls />
        <MiniMap />
        <Background variant={BackgroundVariant.Dots} gap={20} />
      </ReactFlow>
    </div>
  )
}