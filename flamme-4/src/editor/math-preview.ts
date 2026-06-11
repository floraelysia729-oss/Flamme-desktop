/**
 * LaTeX 公式 Live Preview — 非编辑行用 KaTeX Widget 替换 $...$ / $$...$$
 *
 * CM6 限制（ViewPlugin）：
 * - 不可用 block: true
 * - Decoration.replace 不能跨换行
 */
import katex from 'katex'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  WidgetType,
  type ViewUpdate,
} from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'
import { buildPreviewWidgetMask } from './preview-context'
import { scanMathRanges } from './math-ranges'

const hideSource = Decoration.replace({})

function renderKaTeX(math: string, displayMode: boolean): string {
  try {
    return katex.renderToString(math, { displayMode, throwOnError: false })
  } catch {
    return `<code class="cm-math-error">${math.replace(/</g, '&lt;')}</code>`
  }
}

class MathWidget extends WidgetType {
  constructor(
    readonly html: string,
    readonly display: boolean,
  ) {
    super()
  }

  eq(other: WidgetType) {
    return (
      other instanceof MathWidget &&
      other.html === this.html &&
      other.display === this.display
    )
  }

  toDOM() {
    const el = document.createElement(this.display ? 'div' : 'span')
    el.className = this.display
      ? 'cm-math-block cm-math-block--anchor'
      : 'cm-math-inline'
    el.innerHTML = this.html
    return el
  }

  ignoreEvent() {
    return true
  }
}

function spansMultipleLines(view: EditorView, from: number, to: number): boolean {
  if (view.state.doc.lineAt(from).number !== view.state.doc.lineAt(to).number) return true
  return view.state.doc.sliceString(from, to).includes('\n')
}

/** 跨行 $$...$$：在行尾插入块级 Widget，按行隐藏源码（replace 不跨 \\n） */
function pushMultilineMath(
  view: EditorView,
  pending: { from: number; to: number; deco: Decoration }[],
  from: number,
  to: number,
  html: string,
) {
  const firstLine = view.state.doc.lineAt(from)
  pending.push({
    from: firstLine.to,
    to: firstLine.to,
    deco: Decoration.widget({
      widget: new MathWidget(html, true),
      side: 1,
    }),
  })

  let pos = from
  while (pos <= to) {
    const line = view.state.doc.lineAt(pos)
    pending.push({
      from: line.from,
      to: line.from,
      deco: Decoration.line({ class: 'cm-math-src-hidden' }),
    })
    const lineStart = Math.max(line.from, from)
    const lineEnd = Math.min(line.to, to)
    if (lineStart < lineEnd) {
      pending.push({ from: lineStart, to: lineEnd, deco: hideSource })
    }
    if (line.to >= to) break
    pos = line.to + 1
  }
}

function buildMathDecorations(view: EditorView): DecorationSet {
  const head = view.state.selection.main.head
  const doc = view.state.doc.toString()
  const mask = buildPreviewWidgetMask(view, head)
  const pending: { from: number; to: number; deco: Decoration }[] = []

  for (const { from, to, math, display } of mask.math) {
    const html = renderKaTeX(math, display)
    if (spansMultipleLines(view, from, to)) {
      pushMultilineMath(view, pending, from, to, html)
    } else {
      pending.push({
        from,
        to,
        deco: Decoration.replace({
          widget: new MathWidget(html, display),
          inclusive: false,
        }),
      })
    }
  }

  for (const { from, to, display } of scanMathRanges(doc)) {
    if (head < from || head > to) continue
    pending.push({
      from,
      to,
      deco: Decoration.mark({
        class: display ? 'cm-math-editing-block' : 'cm-math-editing-inline',
      }),
    })
  }

  pending.sort((a, b) => a.from - b.from || a.to - b.to)

  const builder = new RangeSetBuilder<Decoration>()
  let lastTo = 0
  for (const { from, to, deco } of pending) {
    if (from < lastTo) continue
    builder.add(from, to, deco)
    lastTo = to
  }
  return builder.finish()
}

export const mathPreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildMathDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildMathDecorations(update.view)
      }
    }
  },
  { decorations: (v) => v.decorations },
)
