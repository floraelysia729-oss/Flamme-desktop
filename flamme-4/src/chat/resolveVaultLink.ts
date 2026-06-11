import type { VFSNode } from '../vfs/types'

function norm(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '').trim()
}

function stem(name: string): string {
  const base = name.split('/').pop() ?? name
  const i = base.lastIndexOf('.')
  return i > 0 ? base.slice(0, i) : base
}

/** Obsidian：[[目标]] 或 [[目标|显示名]]，取链接目标 */
export function parseWikilinkTarget(raw: string): string {
  const pipe = raw.indexOf('|')
  const link = pipe >= 0 ? raw.slice(0, pipe) : raw
  return norm(link.trim())
}

/** 如 [[1. 结论]] — 更像课程/源笔记章节名，而非 entity 页 */
function looksLikeSourceRef(title: string): boolean {
  return /^\d+[\.\、\s]/.test(title.trim())
}

function scorePath(id: string, title: string): number {
  let s = 0
  const n = norm(id)
  const srcLike = looksLikeSourceRef(title)
  if (srcLike) {
    if (!n.includes('/entities/') && !n.startsWith('entities/')) s += 120
    else s -= 40
  } else {
    if (n.includes('/entities/') || n.startsWith('entities/')) s += 100
  }
  if (n.includes('/topics/') || n.startsWith('topics/')) s += 50
  if (n.includes('/comparisons/') || n.startsWith('comparisons/')) s += 40
  if (n.includes('/explorations/') || n.startsWith('explorations/')) s += 40
  return s - n.length * 0.01
}

function pickBestMatch(ids: string[], title: string): string | null {
  if (!ids.length) return null
  return [...ids].sort((a, b) => scorePath(b, title) - scorePath(a, title))[0]
}

/** 在侧栏文件树中解析 wikilink 标题或相对路径 → vault 节点 id（相对路径） */
export function resolveVaultLink(
  target: string,
  nodes: Record<string, VFSNode>,
): string | null {
  const t = parseWikilinkTarget(target)
  if (!t) return null

  if (nodes[t]?.type === 'file') return t

  const withMd = t.endsWith('.md') ? t : `${t}.md`
  if (nodes[withMd]?.type === 'file') return withMd

  const titleStem = stem(t)
  const staticCandidates = [
    withMd,
    `${titleStem}.md`,
    `entities/${titleStem}.md`,
    `topics/${titleStem}.md`,
    `comparisons/${titleStem}.md`,
    `explorations/${titleStem}.md`,
  ]

  const staticHits = staticCandidates.filter((c) => nodes[c]?.type === 'file')
  const staticPick = pickBestMatch(staticHits, titleStem)
  if (staticPick) return staticPick

  const lower = titleStem.toLowerCase()
  const exactMatches: string[] = []
  let fuzzyPath: string | null = null

  for (const [id, node] of Object.entries(nodes)) {
    if (node.type !== 'file') continue
    const idNorm = norm(id)
    if (idNorm === t || idNorm.endsWith(`/${t}`)) return id
    if (idNorm.endsWith(`/${withMd}`)) return id

    const nodeStem = stem(node.name)
    if (nodeStem.toLowerCase() === lower) {
      exactMatches.push(id)
    }
    if (
      !fuzzyPath &&
      (idNorm.includes(lower) || node.name.toLowerCase().includes(lower))
    ) {
      fuzzyPath = id
    }
  }

  return pickBestMatch(exactMatches, titleStem) ?? fuzzyPath
}

export function resolveDocLinkFromElement(
  el: HTMLElement,
  nodes: Record<string, VFSNode>,
): string | null {
  const href = el.getAttribute('data-doc-href')
  if (href) return resolveVaultLink(href, nodes)

  const target = el.getAttribute('data-doc-target')
  if (target) return resolveVaultLink(target, nodes)

  return null
}
