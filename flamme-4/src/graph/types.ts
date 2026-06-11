export interface GraphNode {
  id: string
  label: string
  type: string
  level?: string
  tags?: string[]
  community?: number
  val?: number
  source_file?: string
}

export interface GraphEdge {
  source: string
  target: string
  label: string
}

export interface GraphResponse {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface GraphStats {
  node_count?: number
  edge_count?: number
  entity_count?: number
  [key: string]: unknown
}
