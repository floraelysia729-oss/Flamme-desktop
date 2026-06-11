/** 扫描围栏/行内代码区间，避免把其中的 $ 当成公式 */

export interface TextRange {
  from: number
  to: number
}

const FENCED_RE = /```[\s\S]*?```/g
const INLINE_CODE_RE = /`([^`\n]+)`/g

export function scanCodeRanges(doc: string): TextRange[] {
  const out: TextRange[] = []
  FENCED_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = FENCED_RE.exec(doc)) !== null) {
    out.push({ from: m.index, to: m.index + m[0].length })
  }
  INLINE_CODE_RE.lastIndex = 0
  while ((m = INLINE_CODE_RE.exec(doc)) !== null) {
    out.push({ from: m.index, to: m.index + m[0].length })
  }
  return out.sort((a, b) => a.from - b.from)
}

export function overlapsRange(pos: number, ranges: TextRange[]): boolean {
  return ranges.some((r) => pos >= r.from && pos < r.to)
}

export function rangeInside(inner: TextRange, outer: TextRange): boolean {
  return inner.from >= outer.from && inner.to <= outer.to
}

export function rangeOverlaps(a: TextRange, b: TextRange): boolean {
  return a.from < b.to && b.from < a.to
}
