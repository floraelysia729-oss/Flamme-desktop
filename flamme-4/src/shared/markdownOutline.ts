/** 文档大纲：Markdown 标题 + HTML 锚点 */

import { scanAnchorTargets } from './markdownAnchors'

export interface OutlineItem {
  id: string
  label: string
  level: number
  from: number
  anchorId?: string
}

export interface OutlineNode {
  item: OutlineItem
  children: OutlineNode[]
}

const HEADING_RE = /^ {0,3}(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/
const FENCE_OPEN_RE = /^(`{3,}|~{3,})([a-zA-Z0-9_+-]*)?\s*$/
const FENCE_CLOSE_RE = /^(`{3,}|~{3,})\s*$/
/** 二级章节标题（##）可结束未闭合的围栏，避免长文大纲在代码块后截断 */
const MAJOR_HEADING_RE = /^ {0,3}##\s+\S/

function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'section'
}

function findNearbyAnchor(
  anchors: ReturnType<typeof scanAnchorTargets>,
  headingFrom: number,
  doc: string,
): string | undefined {
  for (const a of anchors) {
    if (a.from >= headingFrom) continue
    const between = doc.slice(a.to, headingFrom)
    const lineCount = between.split('\n').length - 1
    if (lineCount <= 2 && between.trim().length < 120) {
      return a.id
    }
  }
  return undefined
}

export function scanDocOutline(doc: string): OutlineItem[] {
  const anchors = scanAnchorTargets(doc)
  const out: OutlineItem[] = []
  const usedIds = new Map<string, number>()

  const fmMatch = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(doc)
  const fmEnd = fmMatch?.[0].length ?? 0

  let offset = 0
  let inFence = false
  let fenceLen = 0

  for (const line of doc.split('\n')) {
    const lineStart = offset
    const trimmed = line.trim()

    if (lineStart < fmEnd) {
      offset += line.length + 1
      continue
    }

    if (!inFence) {
      const open = FENCE_OPEN_RE.exec(trimmed)
      if (open) {
        inFence = true
        fenceLen = open[1].length
        offset += line.length + 1
        continue
      }
    } else {
      const close = FENCE_CLOSE_RE.exec(trimmed)
      if (close && close[1].length >= fenceLen) {
        inFence = false
        fenceLen = 0
        offset += line.length + 1
        continue
      }
      if (MAJOR_HEADING_RE.test(line)) {
        inFence = false
        fenceLen = 0
      } else {
        offset += line.length + 1
        continue
      }
    }

    const m = HEADING_RE.exec(line)
    if (m) {
      const level = m[1].length
      const label = m[2].replace(/\s+#+\s*$/, '').trim()
      const anchorId = findNearbyAnchor(anchors, lineStart, doc)
      let id = anchorId ?? slugify(label)

      const count = usedIds.get(id) ?? 0
      if (count > 0) id = `${id}-${count}`
      usedIds.set(anchorId ?? slugify(label), count + 1)

      out.push({
        id,
        label,
        level,
        from: lineStart,
        anchorId,
      })
    }

    offset += line.length + 1
  }

  return out
}

export function buildOutlineTree(items: OutlineItem[]): OutlineNode[] {
  if (items.length === 0) return []

  const roots: OutlineNode[] = []
  const stack: OutlineNode[] = []

  for (const item of items) {
    const node: OutlineNode = { item, children: [] }

    while (stack.length > 0 && stack[stack.length - 1].item.level >= item.level) {
      stack.pop()
    }

    if (stack.length === 0) {
      roots.push(node)
    } else {
      stack[stack.length - 1].children.push(node)
    }

    stack.push(node)
  }

  return roots
}

export function resolveOutlinePos(doc: string, item: OutlineItem): number {
  if (item.anchorId) {
    for (const a of scanAnchorTargets(doc)) {
      if (a.id === item.anchorId) return a.from
    }
  }
  return item.from
}

export function activeOutlineId(items: OutlineItem[], docPos: number): string | null {
  if (items.length === 0) return null
  let active: OutlineItem | null = null
  for (const item of items) {
    if (item.from <= docPos) active = item
    else break
  }
  return active?.id ?? null
}
