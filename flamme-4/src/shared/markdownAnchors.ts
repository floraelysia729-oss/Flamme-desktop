/** Markdown 文内锚点：HTML id 与 [label](#id) 链接 */

export interface AnchorTarget {
  id: string
  from: number
  to: number
}

export interface InternalMdLink {
  label: string
  anchorId: string
  from: number
  to: number
}

const HTML_ANCHOR_RE = /<a\s+[^>]*\bid\s*=\s*["']([^"']+)["'][^>]*\/?>/gi
const MD_INTERNAL_LINK_RE = /\[([^\]]+)\]\(#([^)\s]+)\)/g

export function scanAnchorTargets(doc: string): AnchorTarget[] {
  const out: AnchorTarget[] = []
  let m: RegExpExecArray | null

  HTML_ANCHOR_RE.lastIndex = 0
  while ((m = HTML_ANCHOR_RE.exec(doc)) !== null) {
    const id = m[1]?.trim()
    if (!id) continue
    out.push({ id, from: m.index, to: m.index + m[0].length })
  }

  return out
}

export function scanInternalMdLinks(doc: string): InternalMdLink[] {
  const out: InternalMdLink[] = []
  let m: RegExpExecArray | null

  MD_INTERNAL_LINK_RE.lastIndex = 0
  while ((m = MD_INTERNAL_LINK_RE.exec(doc)) !== null) {
    const label = m[1]?.trim() ?? ''
    const anchorId = m[2]?.trim() ?? ''
    if (!anchorId) continue
    out.push({
      label,
      anchorId,
      from: m.index,
      to: m.index + m[0].length,
    })
  }

  return out
}

export function resolveAnchorPos(doc: string, anchorId: string): number | null {
  const norm = anchorId.trim().toLowerCase()
  if (!norm) return null

  for (const t of scanAnchorTargets(doc)) {
    if (t.id.toLowerCase() === norm) return t.from
  }

  return null
}
