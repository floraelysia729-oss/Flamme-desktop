import type { LayoutNode } from './treeLayout'
import type { LayoutLink } from './layoutMode'

export interface CommunityLayoutResult {
  applied: boolean
  groupIds: Map<string, number>
}

function groupNodes(nodes: LayoutNode[]): Map<number, LayoutNode[]> {
  const groups = new Map<number, LayoutNode[]>()
  for (const n of nodes) {
    const g = n.community != null && n.community >= 0 ? n.community : -1
    const list = groups.get(g) ?? []
    list.push(n)
    groups.set(g, list)
  }
  return groups
}

/** 社区锚点 + 组内初始散布；后续由力导向微调 */
export function applyCommunityLayout(
  nodes: LayoutNode[],
  _links: LayoutLink[],
): CommunityLayoutResult {
  const groups = groupNodes(nodes)
  if (groups.size === 0) return { applied: false, groupIds: new Map() }

  const groupIds = new Map<string, number>()
  const entries = [...groups.entries()].sort((a, b) => a[0] - b[0])
  const nGroups = entries.length
  const linkCount = _links.length
  const density = linkCount / Math.max(nodes.length, 1)
  const spread = 1 + Math.min(Math.sqrt(density) * 0.28, 1.3)
  const ringR = Math.max(300, Math.sqrt(nodes.length) * 58 * spread)

  entries.forEach(([groupId, members], gi) => {
    const angle = (gi / nGroups) * Math.PI * 2 - Math.PI / 2
    const cx = Math.cos(angle) * ringR
    const cy = Math.sin(angle) * ringR
    const innerR = Math.max(52, Math.sqrt(members.length) * 20 * spread)

    members.forEach((n, mi) => {
      groupIds.set(n.id, groupId)
      const a = (mi / Math.max(members.length, 1)) * Math.PI * 2
      n.x = cx + Math.cos(a) * innerR
      n.y = cy + Math.sin(a) * innerR
      n.fx = undefined
      n.fy = undefined
    })
  })

  return { applied: entries.length > 0, groupIds }
}
