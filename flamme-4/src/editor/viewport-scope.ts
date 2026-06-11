import type { EditorView } from '@codemirror/view'

export interface CharRange {
  from: number
  to: number
}

/** 视口字符范围 + 缓冲（仅在此范围内做 Widget 替换，避免长文布局塌陷） */
export function getViewportCharRange(view: EditorView, margin = 4000): CharRange {
  const { from, to } = view.viewport
  return {
    from: Math.max(0, from - margin),
    to: Math.min(view.state.doc.length, to + margin),
  }
}

export function rangeIntersects(a: CharRange, b: CharRange): boolean {
  return a.from < b.to && b.from < a.to
}

/** 在视口内，或正在被光标编辑 */
export function shouldRenderWidget(
  view: EditorView,
  range: CharRange,
  cursor: number,
  margin = 4000,
): boolean {
  if (cursor >= range.from && cursor <= range.to) return true
  return rangeIntersects(range, getViewportCharRange(view, margin))
}
