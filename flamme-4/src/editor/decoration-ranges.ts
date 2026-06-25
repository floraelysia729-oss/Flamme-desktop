import { RangeSetBuilder } from '@codemirror/state'
import { Decoration, type DecorationSet, type EditorView } from '@codemirror/view'

export function spansMultipleLines(view: EditorView, from: number, to: number): boolean {
  if (from >= to) return false
  const doc = view.state.doc
  const end = Math.min(to, doc.length)
  if (doc.lineAt(from).number !== doc.lineAt(end).number) return true
  return doc.sliceString(from, end).includes('\n')
}

/** CM6 ViewPlugin 的 replace 装饰不得跨换行，按行切分后压入 ranges */
export function pushHideReplaceRanges(
  view: EditorView,
  ranges: { from: number; to: number }[],
  from: number,
  to: number,
): void {
  if (from >= to) return
  let pos = from
  const doc = view.state.doc
  while (pos < to) {
    const line = doc.lineAt(pos)
    const lineStart = Math.max(line.from, from)
    const lineEnd = Math.min(line.to, to)
    if (lineStart < lineEnd) {
      const slice = doc.sliceString(lineStart, lineEnd)
      if (!slice.includes('\n')) {
        ranges.push({ from: lineStart, to: lineEnd })
      }
    }
    if (line.to >= to) break
    pos = line.to + 1
  }
}

export interface PendingDecoration {
  from: number
  to: number
  deco: Decoration
  /** replace 装饰（含空 replace）不得跨行 */
  replace?: boolean
}

export function finishPendingDecorations(
  view: EditorView,
  pending: PendingDecoration[],
): DecorationSet {
  pending.sort((a, b) => a.from - b.from || a.to - b.to)
  const builder = new RangeSetBuilder<Decoration>()
  let lastTo = 0
  for (const { from, to, deco, replace } of pending) {
    if (from < lastTo) continue
    if (replace && from < to && spansMultipleLines(view, from, to)) continue
    try {
      builder.add(from, to, deco)
      lastTo = to
    } catch {
      // 重叠或非法区间时跳过
    }
  }
  try {
    return builder.finish()
  } catch {
    return Decoration.none
  }
}
