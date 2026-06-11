import type { GraphNode } from './types'

export function clampNodeRadius(val: number | undefined): number {
  const raw = Math.sqrt(val ?? 1) * 2
  return Math.min(8, Math.max(3, raw))
}

export function nodeValForForce(val: number | undefined): number {
  const r = clampNodeRadius(val)
  return (r / 2) ** 2 * Math.PI
}

export interface ForceLayoutParams {
  charge: number
  linkDistance: (srcVal: number, tgtVal: number) => number
  linkStrength: number
  collisionRadius: (val: number | undefined) => number
  warmupTicks: number
  cooldownTicks: number
  alphaDecay: number
}

/** 按节点数与边密度放大斥力、链长与碰撞半径，缓解「毛线球」 */
export function computeForceLayoutParams(
  nodeCount: number,
  linkCount: number,
  isCommunity: boolean,
): ForceLayoutParams {
  const density = linkCount / Math.max(nodeCount, 1)
  const spread =
    1 + Math.min(Math.sqrt(density) * 0.32, 1.45) + Math.sqrt(nodeCount) * 0.035

  if (isCommunity) {
    return {
      charge: -110 * spread,
      linkDistance: (a, b) => (52 + Math.sqrt(a + b) * 11) * spread,
      linkStrength: Math.max(0.08, 0.24 - density * 0.0055),
      collisionRadius: (val) => clampNodeRadius(val) + 8 + Math.min(density * 1.2, 10),
      warmupTicks: Math.min(200, Math.round(55 + nodeCount * 0.4)),
      cooldownTicks: Math.min(320, Math.round(95 + nodeCount * 0.65)),
      alphaDecay: 0.014,
    }
  }

  return {
    charge: -360 * spread,
    linkDistance: (a, b) => (28 + 88 + Math.sqrt(a + b) * 13) * spread,
    linkStrength: Math.max(0.1, 0.36 - density * 0.007),
    collisionRadius: (val) => clampNodeRadius(val) + 10 + Math.min(density * 1.6, 14),
    warmupTicks: Math.min(220, Math.round(75 + nodeCount * 0.45)),
    cooldownTicks: Math.min(360, Math.round(115 + nodeCount * 0.7)),
    alphaDecay: 0.013,
  }
}

/** 缩放低于阈值时渐隐标签；hover/选中始终显示 */
export function labelOpacity(globalScale: number, forceShow: boolean): number {
  if (forceShow) return 1
  if (globalScale >= 0.4) return 1
  if (globalScale <= 0.2) return 0
  return (globalScale - 0.2) / 0.2
}

export function fuzzyMatchNode(
  nodes: GraphNode[],
  query: string,
): GraphNode | undefined {
  const q = query.trim().toLowerCase()
  if (!q) return undefined

  const exact = nodes.find(
    (n) => n.id.toLowerCase() === q || n.label.toLowerCase() === q,
  )
  if (exact) return exact

  const contains = nodes.filter(
    (n) => n.label.toLowerCase().includes(q) || n.id.toLowerCase().includes(q),
  )
  if (contains.length === 0) return undefined
  contains.sort((a, b) => a.label.length - b.label.length)
  return contains[0]
}

export function neighborIds(
  nodeId: string,
  links: { source: string | { id: string }; target: string | { id: string } }[],
): Set<string> {
  const ids = new Set<string>([nodeId])
  for (const l of links) {
    const src = typeof l.source === 'object' ? l.source.id : l.source
    const tgt = typeof l.target === 'object' ? l.target.id : l.target
    if (src === nodeId) ids.add(tgt)
    if (tgt === nodeId) ids.add(src)
  }
  return ids
}

export function oneHopSubgraph(
  centerId: string,
  nodes: GraphNode[],
  edges: { source: string; target: string; label: string }[],
): { nodes: GraphNode[]; edges: typeof edges } {
  const hop = neighborIds(centerId, edges)
  const filteredNodes = nodes.filter((n) => hop.has(n.id))
  const ids = new Set(filteredNodes.map((n) => n.id))
  const filteredEdges = edges.filter((e) => ids.has(e.source) && ids.has(e.target))
  return { nodes: filteredNodes, edges: filteredEdges }
}
