/**
 * 围栏代码块 Live Preview — 非编辑区用 hljs Widget 替换源码
 */
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  WidgetType,
  type ViewUpdate,
} from '@codemirror/view'
import { renderEditorCodeBlockPreview } from '../shared/markdownCodeHighlight'
import { buildPreviewWidgetMask } from './preview-context'
import { scanFencedCodeBlocks } from './fenced-code-ranges'
import type { FencedCodeRange } from './fenced-code-ranges'
import { finishPendingDecorations, type PendingDecoration } from './decoration-ranges'
import { widgetPreviewUpdate } from './preview-update'

const hideSource = Decoration.replace({})

class CodeBlockPreviewWidget extends WidgetType {
  constructor(readonly html: string) {
    super()
  }

  eq(other: WidgetType) {
    return other instanceof CodeBlockPreviewWidget && other.html === this.html
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('div')
    wrap.innerHTML = this.html
    const el = wrap.firstElementChild
    return el instanceof HTMLElement ? el : wrap
  }

  ignoreEvent() {
    return true
  }
}

function cursorInRange(head: number, from: number, to: number): boolean {
  return head >= from && head <= to
}

function pushCollapsedCodeBlock(
  view: EditorView,
  pending: PendingDecoration[],
  block: FencedCodeRange,
  html: string,
) {
  if (!html) return
  const firstLine = view.state.doc.lineAt(block.from)
  pending.push({
    from: firstLine.to,
    to: firstLine.to,
    deco: Decoration.widget({
      widget: new CodeBlockPreviewWidget(html),
      side: 1,
    }),
  })

  let pos = block.from
  while (pos < block.to) {
    const line = view.state.doc.lineAt(pos)
    if (line.number !== firstLine.number) {
      pending.push({
        from: line.from,
        to: line.from,
        deco: Decoration.line({ class: 'cm-code-src-hidden' }),
      })
    }
    const lineStart = Math.max(line.from, block.from)
    const lineEnd = Math.min(line.to, block.to)
    if (lineStart < lineEnd) {
      pending.push({ from: lineStart, to: lineEnd, replace: true, deco: hideSource })
    }
    if (line.to >= block.to) break
    pos = line.to + 1
  }
}

function pushEditingCodeBlock(
  pending: PendingDecoration[],
  view: EditorView,
  from: number,
  to: number,
) {
  let pos = from
  while (pos <= to) {
    const line = view.state.doc.lineAt(pos)
    pending.push({
      from: line.from,
      to: line.from,
      deco: Decoration.line({ class: 'cm-fenced-code-editing' }),
    })
    if (line.to >= to) break
    pos = line.to + 1
  }
}

function buildCodeBlockDecorations(view: EditorView): DecorationSet {
  const head = view.state.selection.main.head
  const mask = buildPreviewWidgetMask(view, head)
  const pending: PendingDecoration[] = []

  for (const block of scanFencedCodeBlocks(view.state)) {
    if (cursorInRange(head, block.from, block.to)) {
      pushEditingCodeBlock(pending, view, block.from, block.to)
      continue
    }
    const visible = mask.fencedCode.some(
      (b) => b.from === block.from && b.to === block.to,
    )
    if (!visible) continue

    const html = renderEditorCodeBlockPreview(block.code, block.lang)
    pushCollapsedCodeBlock(view, pending, block, html)
  }

  return finishPendingDecorations(view, pending)
}

export const codeBlockPreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildCodeBlockDecorations(view)
    }

    update(update: ViewUpdate) {
      widgetPreviewUpdate(update, this, buildCodeBlockDecorations)
    }
  },
  { decorations: (v) => v.decorations },
)
