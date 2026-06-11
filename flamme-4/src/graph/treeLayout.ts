import type { GraphNode } from './types'
import { isHierarchicalRelation } from './colors'
import type { LayoutLink } from './layoutMode'

export interface LayoutNode extends GraphNode {
  x?: number
  y?: number
  fx?: number
  fy?: number
}

export interface HierarchyLayoutResult {
  applied: boolean
  pinnedIds: Set<string>
}

const FOREST_GAP = 120
const SATELLITE_GAP = 48

function layoutGaps(nodeCount: number, maxLayerWidth: number) {
  const layerGap = Math.max(100, Math.min(180, 800 / Math.sqrt(Math.max(nodeCount, 1))))
  const siblingGap = Math.max(72, Math.min(120, 600 / Math.sqrt(Math.max(maxLayerWidth, 1))))
  return { layerGap, siblingGap }
}

/** 单棵子树：x=深度（向下），y=兄弟展开 */
function layoutSubtree(
  rootId: string,
  children: Map<string, string[]>,
  layerGap: number,
  siblingGap: number,
): { positions: Map<string, { x: number; y: number }>; width: number; height: number } {
  const positions = new Map<string, { x: number; y: number }>()
  let leafY = 0
  let maxDepth = 0

  const visit = (id: string, depth: number, ancestors: Set<string>): number => {
    maxDepth = Math.max(maxDepth, depth)
    const kids = [...(children.get(id) ?? [])]
      .sort()
      .filter((c) => !ancestors.has(c))
    if (kids.length === 0) {
      const y = leafY * siblingGap
      positions.set(id, { x: depth * layerGap, y })
      leafY += 1
      return y
    }
    const nextAncestors = new Set(ancestors)
    nextAncestors.add(id)
    const childYs = kids.map((c) => visit(c, depth + 1, nextAncestors))
    const y = (Math.min(...childYs) + Math.max(...childYs)) / 2
    positions.set(id, { x: depth * layerGap, y })
    return y
  }

  visit(rootId, 0, new Set())

  let minY = Infinity
  let maxY = -Infinity
  for (const p of positions.values()) {
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  if (!Number.isFinite(minY)) {
    minY = 0
    maxY = 0
  }

  const normalized = new Map<string, { x: number; y: number }>()
  for (const [id, p] of positions) {
    normalized.set(id, { x: p.x, y: p.y - minY })
  }

  return {
    positions: normalized,
    width: (maxDepth + 1) * layerGap,
    height: maxY - minY + siblingGap,
  }
}

/** 纵向森林：仅用上下级边排骨架；卫星节点锚定到最近层次祖先 */
export function applyHierarchyLayout(
  nodes: LayoutNode[],
  links: LayoutLink[],
): HierarchyLayoutResult {
  const empty = { applied: false, pinnedIds: new Set<string>() }
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

  const layerWidths = new Map<number, number>()
  const depth = new Map<string, number>()
  const queue = roots.map((id) => ({ id, d: 0 }))
  while (queue.length > 0) {
    const { id, d } = queue.shift()!
    if (depth.has(id)) continue
    depth.set(id, d)
    layerWidths.set(d, (layerWidths.get(d) ?? 0) + 1)
    for (const c of children.get(id) ?? []) {
      if (!depth.has(c)) queue.push({ id: c, d: d + 1 })
    }
  }

  const maxLayerWidth = Math.max(1, ...layerWidths.values())
  const { layerGap, siblingGap } = layoutGaps(nodes.length, maxLayerWidth)

  const positions = new Map<string, { x: number; y: number }>()
  let forestX = 0
  let maxForestHeight = 0

  for (const root of [...roots].sort()) {
    const { positions: subtree, width, height } = layoutSubtree(
      root,
      children,
      layerGap,
      siblingGap,
    )
    for (const [id, p] of subtree) {
      positions.set(id, { x: forestX + p.x, y: p.y })
    }
    forestX += width + FOREST_GAP
    maxForestHeight = Math.max(maxForestHeight, height)
  }

  const pinnedIds = new Set<string>()
  const anchorOf = new Map<string, { x: number; y: number }>()

  const pin = (id: string, p: { x: number; y: number }) => {
    positions.set(id, p)
    pinnedIds.add(id)
    anchorOf.set(id, p)
  }

  for (const [id, p] of positions) pin(id, p)

  const satelliteSlot = new Map<string, number>()
  const orphanRow = maxForestHeight + layerGap

  for (const n of nodes) {
    if (pinnedIds.has(n.id)) {
      const p = positions.get(n.id)!
      n.x = p.x
      n.y = p.y
      n.fx = p.x
      n.fy = p.y
      continue
    }

    let anchor: { x: number; y: number } | null = null
    for (const l of links) {
      if (l.source === n.id && anchorOf.has(l.target)) anchor = anchorOf.get(l.target)!
      else if (l.target === n.id && anchorOf.has(l.source)) anchor = anchorOf.get(l.source)!
      if (anchor) break
    }

    let x: number
    let y: number
    if (anchor) {
      const key = `${anchor.x},${anchor.y}`
      const slot = satelliteSlot.get(key) ?? 0
      satelliteSlot.set(key, slot + 1)
      const angle = (slot * 72 * Math.PI) / 180
      x = anchor.x + Math.cos(angle) * SATELLITE_GAP
      y = anchor.y + Math.sin(angle) * SATELLITE_GAP
    } else {
      const slot = satelliteSlot.get('orphan') ?? 0
      satelliteSlot.set('orphan', slot + 1)
      x = (slot % 6) * SATELLITE_GAP - SATELLITE_GAP * 2.5
      y = orphanRow + Math.floor(slot / 6) * SATELLITE_GAP
    }

    pin(n.id, { x, y })
    n.x = x
    n.y = y
    n.fx = x
    n.fy = y
  }

  return { applied: true, pinnedIds }
}

export function clearFixedPositions(nodes: LayoutNode[]): void {
  for (const n of nodes) {
    n.fx = undefined
    n.fy = undefined
  }
}

/** 仿真冷却后锁定坐标，防止悬停/重绘时节点漂移 */
export function freezeGraphPositions(nodes: LayoutNode[]): void {
  for (const n of nodes) {
    if (n.x != null && n.y != null) {
      n.fx = n.x
      n.fy = n.y
    }
  }
}
