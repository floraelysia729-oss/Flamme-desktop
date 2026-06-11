/**
 * 识别「引用块内的围栏代码」：> ```lang … > ```
 * CM 默认语法树常将其解析为普通段落，需单独扫描行级样式。
 */
import type { EditorView } from '@codemirror/view'

const BQ_FENCE_OPEN = /^\s*>\s*```(\w*)\s*$/
const BQ_FENCE_CLOSE = /^\s*>\s*```\s*$/

export function blockquoteFenceLineRange(
  doc: EditorView['state']['doc'],
): { from: number; to: number }[] {
  const ranges: { from: number; to: number }[] = []
  let i = 1
  while (i <= doc.lines) {
    const line = doc.line(i)
    if (!BQ_FENCE_OPEN.test(line.text)) {
      i += 1
      continue
    }
    const start = line.from
    let end = line.to
    let j = i + 1
    while (j <= doc.lines) {
      const ln = doc.line(j)
      end = ln.to
      if (BQ_FENCE_CLOSE.test(ln.text)) break
      j += 1
    }
    ranges.push({ from: start, to: end })
    i = j + 1
  }
  return ranges
}

export function lineInBlockquoteFence(
  doc: EditorView['state']['doc'],
  lineNumber: number,
): boolean {
  for (const { from, to } of blockquoteFenceLineRange(doc)) {
    const line = doc.line(lineNumber)
    if (line.from >= from && line.from <= to) return true
  }
  return false
}
