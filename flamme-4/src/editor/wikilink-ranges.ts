/** 扫描文档中所有 [[wikilink]] 区间 */
import { parseWikilinkTarget } from '../chat/resolveVaultLink'

export const WIKI_RE = /\[\[([^\]\n]+?)\]\]/g

export interface WikilinkRange {
  from: number
  to: number
  title: string
}

export function scanWikilinks(doc: string): WikilinkRange[] {
  const out: WikilinkRange[] = []
  WIKI_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = WIKI_RE.exec(doc)) !== null) {
    const title = parseWikilinkTarget(m[1])
    if (title) out.push({ from: m.index, to: m.index + m[0].length, title })
  }
  return out
}

export function wikilinkAt(doc: string, pos: number): WikilinkRange | null {
  for (const r of scanWikilinks(doc)) {
    if (pos >= r.from && pos <= r.to) return r
  }
  return null
}

/** 预览态（非编辑该链接）：用 Widget 替换整段 [[...]] */
export function isWikilinkPreview(doc: string, pos: number, cursor: number): boolean {
  const r = wikilinkAt(doc, pos)
  if (!r) return false
  return !(cursor >= r.from && cursor <= r.to)
}
