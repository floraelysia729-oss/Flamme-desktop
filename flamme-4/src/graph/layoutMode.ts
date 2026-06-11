import type { GraphNode } from './types'
import { isHierarchicalRelation } from './colors'

export type LayoutMode = 'network' | 'hierarchy'
export type ResolvedLayoutMode = 'hierarchy' | 'force' | 'community'

export type LayoutLink = { source: string; target: string; label: string }

export interface HierarchyMetrics {
  rootRatio: number
  maxLayerWidth: number
  hierEdgeCount: number
  hierarchyNodeCount: number
}

export const LAYOUT_UI_LABELS: Record<LayoutMode, string> = {
  network: '关联网络',
  hierarchy: '学习层次',
}

export function countCommunities(nodes: Pick<GraphNode, 'community'>[]): number {
  const ids = new Set<number>()
  for (const n of nodes) {
    if (n.community != null && n.community >= 0) ids.add(n.community)
  }
  return ids.size
}

export function assessHierarchyQuality(
  nodes: Pick<GraphNode, 'id'>[],
  links: LayoutLink[],
): HierarchyMetrics {
  const empty: HierarchyMetrics = {
    rootRatio: 1,
    maxLayerWidth: 0,
    hierEdgeCount: 0,
    hierarchyNodeCount: 0,
  }
  const hierLinks = links.filter((l) => isHierarchicalRelation(l.label))
  if (hierLinks.length === 0) return empty

  const ids = new Set(nodes.map((n) => n.id))
  const childToParent = new Map<string, string>()
  const children = new Map<string, string[]>()

  for (const l of hierLinks) {
    if (!ids.has(l.source) || !ids.has(l.target)) continue
    childToParent.set(l.source, l.target)
    const list = children.get(l.target) ?? []
    list.push(l.source)
    children.set(l.target, list)
  }

  const roots = nodes.map((n) => n.id).filter((id) => !childToParent.has(id))
  if (roots.length === 0) return empty

  const depth = new Map<string, number>()
  const queue = roots.map((id) => ({ id, d: 0 }))
  while (queue.length > 0) {
    const { id, d } = queue.shift()!
    if (depth.has(id)) continue
    depth.set(id, d)
    for (const c of children.get(id) ?? []) {
      if (!depth.has(c)) queue.push({ id: c, d: d + 1 })
    }
  }

  const layerWidths = new Map<number, number>()
  for (const d of depth.values()) {
    layerWidths.set(d, (layerWidths.get(d) ?? 0) + 1)
  }

  return {
    rootRatio: roots.length / Math.max(nodes.length, 1),
    maxLayerWidth: Math.max(0, ...layerWidths.values()),
    hierEdgeCount: hierLinks.length,
    hierarchyNodeCount: depth.size,
  }
}

export function isHierarchyLayoutViable(metrics: HierarchyMetrics): boolean {
  return (
    metrics.hierEdgeCount > 0 &&
    metrics.rootRatio <= 0.3 &&
    metrics.maxLayerWidth <= 40
  )
}

/** 关联网络模式：在力导向与社区聚类间自动选择 */
export function pickNetworkLayout(
  nodes: Pick<GraphNode, 'community'>[],
): 'force' | 'community' {
  if (countCommunities(nodes) >= 3) return 'community'
  return 'force'
}

export function resolveLayoutMode(
  mode: LayoutMode,
  nodes: Pick<GraphNode, 'id' | 'community'>[],
  _links: LayoutLink[],
): ResolvedLayoutMode {
  if (mode === 'hierarchy') return 'hierarchy'
  return pickNetworkLayout(nodes)
}
