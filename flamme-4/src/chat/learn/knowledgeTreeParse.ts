import type { TreeNode, TreeNodeStatus } from './types'

const STATUS_PREFIX: Record<string, TreeNodeStatus> = {
  '✓': 'learned',
  '→': 'current',
  '□': 'todo',
  '○': 'branch',
}

export const PREFIX_BY_STATUS: Record<TreeNodeStatus, string> = {
  learned: '✓',
  current: '→',
  todo: '□',
  branch: '○',
}

export const STATUS_LABELS: Record<TreeNodeStatus, string> = {
  learned: '已掌握',
  current: '正在学',
  todo: '待学习',
  branch: '旁支',
}

export const STATUS_COLORS: Record<TreeNodeStatus, string> = {
  learned: 'kt-status--learned',
  current: 'kt-status--current',
  todo: 'kt-status--todo',
  branch: 'kt-status--branch',
}

export interface KnowledgeTreeStats {
  total: number
  learned: number
  current: number
  todo: number
  branch: number
}

export interface KnowledgeTreeAnalysis {
  roots: TreeNode[]
  stats: KnowledgeTreeStats
  /** 从根到当前焦点的路径（节点引用） */
  currentPath: TreeNode[]
  /** 路径键，如 "0/2/1" */
  currentPathKeys: Set<string>
  /** 建议的下一步节点 */
  nextStep: TreeNode | null
  nextStepKey: string | null
}

function parseLine(line: string): { depth: number; status: TreeNodeStatus | null; label: string } | null {
  const trimmed = line.trimEnd()
  if (!trimmed) return null

  const prefix = trimmed.match(/^([├└│─\s]+)/)
  const depth = prefix ? Math.floor(prefix[1].replace(/[^│\s]/g, ' ').length / 2) : 0
  const rest = prefix ? trimmed.slice(prefix[1].length) : trimmed

  const m = rest.match(/^(✓|→|□|○)\s+(.+)$/)
  if (m) {
    return { depth, status: STATUS_PREFIX[m[1]], label: m[2].trim() }
  }
  return { depth, status: null, label: rest.trim() }
}

/** 将目录树文本解析为嵌套节点 */
export function parseKnowledgeTree(text: string): TreeNode[] {
  const lines = text.split('\n').filter((l) => l.trim())
  if (lines.length === 0) return []

  const roots: TreeNode[] = []
  const stack: { depth: number; node: TreeNode }[] = []

  for (const line of lines) {
    const parsed = parseLine(line)
    if (!parsed || !parsed.label) continue

    const node: TreeNode = {
      label: parsed.label,
      status: parsed.status,
      children: [],
    }

    while (stack.length > 0 && stack[stack.length - 1].depth >= parsed.depth) {
      stack.pop()
    }

    if (stack.length === 0) {
      roots.push(node)
      stack.push({ depth: parsed.depth, node })
    } else {
      stack[stack.length - 1].node.children.push(node)
      stack.push({ depth: parsed.depth, node })
    }
  }

  return roots
}

export function pathKey(indices: number[]): string {
  return indices.join('/')
}

export function countNodes(roots: TreeNode[]): KnowledgeTreeStats {
  const stats: KnowledgeTreeStats = {
    total: 0,
    learned: 0,
    current: 0,
    todo: 0,
    branch: 0,
  }

  const walk = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      stats.total += 1
      if (n.status) stats[n.status] += 1
      walk(n.children)
    }
  }
  walk(roots)
  return stats
}

function findDeepestPathWithStatus(
  roots: TreeNode[],
  status: TreeNodeStatus,
): { path: TreeNode[]; keys: number[] } | null {
  let best: { path: TreeNode[]; keys: number[] } | null = null

  const walk = (node: TreeNode, path: TreeNode[], keys: number[]) => {
    const nextPath = [...path, node]
    const nextKeys = [...keys]
    if (node.status === status) {
      if (!best || nextPath.length > best.path.length) {
        best = { path: nextPath, keys: nextKeys }
      }
    }
    node.children.forEach((child, i) => walk(child, nextPath, [...nextKeys, i]))
  }

  roots.forEach((root, i) => walk(root, [], [i]))
  return best
}

function findFirstWithStatus(roots: TreeNode[], status: TreeNodeStatus): { node: TreeNode; key: string } | null {
  let found: { node: TreeNode; key: string } | null = null

  const walk = (node: TreeNode, keys: number[]) => {
    if (found) return
    if (node.status === status) {
      found = { node, key: pathKey(keys) }
      return
    }
    node.children.forEach((child, i) => walk(child, [...keys, i]))
  }

  roots.forEach((root, i) => walk(root, [i]))
  return found
}

function getNodeAt(roots: TreeNode[], keys: number[]): TreeNode | null {
  let nodes = roots
  let node: TreeNode | null = null
  for (const i of keys) {
    node = nodes[i] ?? null
    if (!node) return null
    nodes = node.children
  }
  return node
}

function findNextStepNode(
  roots: TreeNode[],
  currentPathKeys: Set<string>,
  currentMatch: { path: TreeNode[]; keys: number[] } | null,
): { node: TreeNode; key: string } | null {
  if (currentMatch) {
    const current = currentMatch.path[currentMatch.path.length - 1]
    const under = findNextTodoUnder(current, currentMatch.keys)
    if (under) return under

    let keys = [...currentMatch.keys]
    while (keys.length > 0) {
      const parentKeys = keys.slice(0, -1)
      const idx = keys[keys.length - 1]
      const siblings = parentKeys.length === 0 ? roots : getNodeAt(roots, parentKeys)?.children ?? []
      for (let i = idx + 1; i < siblings.length; i += 1) {
        const sib = siblings[i]
        if (sib.status === 'todo') return { node: sib, key: pathKey([...parentKeys, i]) }
        const nested = findFirstWithStatus([sib], 'todo')
        if (nested) return nested
      }
      keys = parentKeys
    }
  }

  const deepestKey = currentMatch
    ? pathKey(currentMatch.keys)
  : null

  let found: { node: TreeNode; key: string } | null = null
  const walk = (node: TreeNode, keys: number[]) => {
    if (found) return
    const key = pathKey(keys)
    if (node.status === 'todo') {
      const onPath = currentPathKeys.has(key)
      const isAncestorOfCurrent = [...currentPathKeys].some((k) => k.startsWith(`${key}/`))
      const underCurrent = deepestKey != null && (key.startsWith(`${deepestKey}/`) || key === deepestKey)
      if (!onPath && !isAncestorOfCurrent && !underCurrent) {
        found = { node, key }
        return
      }
    }
    node.children.forEach((child, i) => walk(child, [...keys, i]))
  }
  roots.forEach((root, i) => walk(root, [i]))
  return found
}

function findNextTodoUnder(node: TreeNode, keys: number[]): { node: TreeNode; key: string } | null {
  for (let i = 0; i < node.children.length; i += 1) {
    const child = node.children[i]
    const childKey = pathKey([...keys, i])
    if (child.status === 'todo') return { node: child, key: childKey }
    const nested = findNextTodoUnder(child, [...keys, i])
    if (nested) return nested
  }
  return null
}

/** 推断当前路径与下一步，供导航型大纲使用 */
export function analyzeKnowledgeTree(text: string): KnowledgeTreeAnalysis {
  const roots = parseKnowledgeTree(text)
  const stats = countNodes(roots)

  const currentMatch = findDeepestPathWithStatus(roots, 'current')
  const currentPath = currentMatch?.path ?? []
  const currentPathKeys = new Set<string>(
    currentMatch ? currentMatch.keys.map((_, i) => pathKey(currentMatch!.keys.slice(0, i + 1))) : [],
  )

  let nextStep: TreeNode | null = null
  let nextStepKey: string | null = null

  const nextMatch = findNextStepNode(roots, currentPathKeys, currentMatch)
  if (nextMatch) {
    nextStep = nextMatch.node
    nextStepKey = nextMatch.key
  }

  return {
    roots,
    stats,
    currentPath,
    currentPathKeys,
    nextStep,
    nextStepKey,
  }
}

/** 节点是否应默认展开：仅当前路径上的祖先与路径节点 */
export function shouldDefaultExpand(nodePath: string, currentPathKeys: Set<string>, depth: number): boolean {
  if (currentPathKeys.size === 0) return depth < 2
  if (currentPathKeys.has(nodePath)) return true
  for (const key of currentPathKeys) {
    if (key.startsWith(`${nodePath}/`)) return true
  }
  return false
}

/** 节点是否在当前学习路径上 */
export function isOnCurrentPath(nodePath: string, currentPathKeys: Set<string>): boolean {
  return currentPathKeys.has(nodePath)
}

function renderNode(node: TreeNode, prefix: string, isLast: boolean, lines: string[]): void {
  const connector = isLast ? '└─' : '├─'
  const status = node.status ? `${PREFIX_BY_STATUS[node.status]} ` : ''
  lines.push(`${prefix}${connector}${status}${node.label}`)

  const childPrefix = prefix + (isLast ? '  ' : '│ ')
  node.children.forEach((child, i) => {
    renderNode(child, childPrefix, i === node.children.length - 1, lines)
  })
}

export function serializeKnowledgeTree(roots: TreeNode[]): string {
  if (roots.length === 0) return '□ 未命名主题'
  const lines: string[] = []
  roots.forEach((root, i) => {
    if (root.children.length === 0 && lines.length === 0) {
      const status = root.status ? `${PREFIX_BY_STATUS[root.status]} ` : '□ '
      lines.push(`${status}${root.label}`)
    } else {
      renderNode(root, '', i === roots.length - 1, lines)
    }
  })
  return lines.join('\n')
}
