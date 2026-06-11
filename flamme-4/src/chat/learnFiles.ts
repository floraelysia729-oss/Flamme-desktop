import type { VFSNode } from '../vfs/types'

const SOURCE_EXTS = new Set(['pdf', 'md', 'excalidraw'])
const SKIP_PREFIXES = ['entities/', 'topics/', 'comparisons/', 'explorations/']

export function isLearnSourcePath(path: string): boolean {
  const p = path.replace(/\\/g, '/')
  if (p.startsWith('.') || p.includes('.flamme')) return false
  return !SKIP_PREFIXES.some((prefix) => p.startsWith(prefix))
}

function isLearnSourceFile(nodes: Record<string, VFSNode>, id: string): boolean {
  const node = nodes[id]
  if (!node || node.type !== 'file') return false
  const ext = node.name.includes('.') ? node.name.split('.').pop()!.toLowerCase() : ''
  return SOURCE_EXTS.has(ext) && isLearnSourcePath(id)
}

/** 从侧栏文件树收集 learn 模式可选源文件（vault 下 id 即相对路径） */
export function collectLearnSourcePaths(
  nodes: Record<string, VFSNode>,
  rootId: string,
): string[] {
  return collectLearnFilesUnder(nodes, rootId).sort((a, b) => a.localeCompare(b))
}

/** 收集某节点（文件或文件夹）下所有可选源文件路径 */
export function collectLearnFilesUnder(
  nodes: Record<string, VFSNode>,
  nodeId: string,
): string[] {
  const node = nodes[nodeId]
  if (!node) return []
  if (node.type === 'file') {
    return isLearnSourceFile(nodes, nodeId) ? [nodeId.replace(/\\/g, '/')] : []
  }
  const out: string[] = []
  for (const childId of node.children ?? []) {
    out.push(...collectLearnFilesUnder(nodes, childId))
  }
  return out
}

export interface LearnScopeNode {
  id: string
  name: string
  type: 'file' | 'folder'
  children?: LearnScopeNode[]
}

/** 构建带文件夹层级的 learn 范围树（仅含含源文件的枝） */
export function buildLearnScopeTree(
  nodes: Record<string, VFSNode>,
  rootId: string,
): LearnScopeNode[] {
  const node = nodes[rootId]
  if (!node) return []

  if (node.type === 'file') {
    if (!isLearnSourceFile(nodes, rootId)) return []
    return [{ id: rootId, name: node.name, type: 'file' }]
  }

  const children: LearnScopeNode[] = []
  for (const childId of node.children ?? []) {
    const childNode = nodes[childId]
    if (!childNode) continue
    if (childNode.type === 'file') {
      if (isLearnSourceFile(nodes, childId)) {
        children.push({ id: childId, name: childNode.name, type: 'file' })
      }
    } else {
      const sub = buildLearnScopeTree(nodes, childId)
      if (sub.length > 0) {
        children.push({
          id: childId,
          name: childNode.name,
          type: 'folder',
          children: sub,
        })
      }
    }
  }

  return children.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export type FolderCheckState = 'none' | 'partial' | 'all'

export function folderCheckState(
  nodes: Record<string, VFSNode>,
  folderId: string,
  selected: string[],
): FolderCheckState {
  const files = collectLearnFilesUnder(nodes, folderId)
  if (files.length === 0) return 'none'
  const sel = new Set(selected.map((p) => p.replace(/\\/g, '/')))
  let hit = 0
  for (const f of files) {
    if (sel.has(f)) hit++
  }
  if (hit === 0) return 'none'
  if (hit === files.length) return 'all'
  return 'partial'
}

export function toggleLearnFolderSelection(
  nodes: Record<string, VFSNode>,
  folderId: string,
  selected: string[],
): string[] {
  const files = collectLearnFilesUnder(nodes, folderId)
  const state = folderCheckState(nodes, folderId, selected)
  const sel = new Set(selected.map((p) => p.replace(/\\/g, '/')))
  if (state === 'all' || state === 'partial') {
    for (const f of files) sel.delete(f)
  } else {
    for (const f of files) sel.add(f)
  }
  return [...sel]
}

export function toggleLearnFileSelection(selected: string[], path: string): string[] {
  const norm = path.replace(/\\/g, '/')
  const sel = new Set(selected.map((p) => p.replace(/\\/g, '/')))
  if (sel.has(norm)) sel.delete(norm)
  else sel.add(norm)
  return [...sel]
}
