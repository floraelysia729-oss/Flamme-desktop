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

export const STATUS_COLORS: Record<TreeNodeStatus, string> = {
  learned: 'bg-emerald-400',
  current: 'bg-amber-400',
  todo: 'bg-sky-400',
  branch: 'bg-violet-400',
}

function parseLine(line: string): { depth: number; status: TreeNodeStatus | null; label: string } | null {
  const trimmed = line.trimEnd()
  if (!trimmed) return null

  const prefix = trimmed.match(/^([├└│\s]+)/)
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
