import api from './client'

export interface GraphNode {
  id: string
  label: string
  type: 'topic' | 'entity' | 'keyword' | 'chapter'
  timestampRef: number | null
  summary: string | null
  metadata: Record<string, unknown>
}

export interface GraphEdge {
  source: string
  target: string
  relation: string
}

export interface Graph {
  _id: string
  videoId: string
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export async function getGraph(videoId: string) {
  const { data } = await api.get(`/graphs/${videoId}`)
  return data as Graph
}
