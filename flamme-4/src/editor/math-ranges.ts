import { rangeOverlaps, scanCodeRanges, type TextRange } from './markdown-ranges'

export interface MathRange extends TextRange {
  math: string
  display: boolean
}

function inCode(pos: number, codeRanges: TextRange[]): boolean {
  return codeRanges.some((r) => pos >= r.from && pos < r.to)
}

/** 扫描 $...$ / $$...$$（跳过代码块内的 $） */
export function scanMathRanges(doc: string): MathRange[] {
  const codeRanges = scanCodeRanges(doc)
  const out: MathRange[] = []

  const blockRe = /\$\$([\s\S]*?)\$\$/g
  let m: RegExpExecArray | null
  while ((m = blockRe.exec(doc)) !== null) {
    const from = m.index
    const to = from + m[0].length
    if (inCode(from, codeRanges)) continue
    out.push({ from, to, math: m[1].trim(), display: true })
  }

  const inlineRe = /\$([^\$\n]+?)\$/g
  inlineRe.lastIndex = 0
  while ((m = inlineRe.exec(doc)) !== null) {
    const from = m.index
    const to = from + m[0].length
    if (inCode(from, codeRanges)) continue
    const candidate: TextRange = { from, to }
    if (out.some((existing) => rangeOverlaps(candidate, existing))) continue
    out.push({ from, to, math: m[1].trim(), display: false })
  }

  return out.sort((a, b) => a.from - b.from)
}

export function mathAt(doc: string, pos: number): MathRange | null {
  for (const r of scanMathRanges(doc)) {
    if (pos >= r.from && pos <= r.to) return r
  }
  return null
}

export function isMathPreview(doc: string, pos: number, cursor: number): boolean {
  const r = mathAt(doc, pos)
  if (!r) return false
  return !(cursor >= r.from && cursor <= r.to)
}
