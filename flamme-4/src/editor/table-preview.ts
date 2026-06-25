/**
 * GFM 管道表格 Live Preview — 非编辑区折叠为 HTML 表格
 * CM6 不能跨行 replace，故：首行插入 Widget + 隐藏各行源码
 */
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  WidgetType,
  type ViewUpdate,
} from '@codemirror/view'
import { gfmTableMarkdownToHtml } from '../shared/markdownTableHtml'
import { buildPreviewWidgetMask } from './preview-context'
import type { GfmTableRange } from './table-ranges'
import { scanGfmTableBlocks } from './table-ranges'
import { finishPendingDecorations, type PendingDecoration } from './decoration-ranges'
import { widgetPreviewUpdate } from './preview-update'

const hideSource = Decoration.replace({})

class GfmTableWidget extends WidgetType {
  constructor(readonly html: string) {
    super()
  }

  eq(other: WidgetType) {
    return other instanceof GfmTableWidget && other.html === this.html
  }

  toDOM() {
    const wrap = document.createElement('div')
    wrap.className = 'cm-html-preview cm-gfm-table-preview'
    wrap.innerHTML = this.html
    return wrap
  }

  ignoreEvent() {
    return true
  }
}

function tableLines(view: EditorView, from: number, to: number) {
  const lines: ReturnType<EditorView['state']['doc']['lineAt']>[] = []
  let pos = from
  while (pos < to) {
    const line = view.state.doc.lineAt(pos)
    if (line.from >= to) break
    lines.push(line)
    if (line.to >= to) break
    pos = line.to + 1
  }
  return lines
}

function cursorInRange(head: number, from: number, to: number): boolean {
  return head >= from && head <= to
}

function pushCollapsedTable(
  view: EditorView,
  pending: PendingDecoration[],
  block: GfmTableRange,
  html: string,
) {
  if (!html) return
  const firstLine = view.state.doc.lineAt(block.from)
  // ViewPlugin 禁止 block widget；widget 在行内，首行不能 height:0（见 math-preview 跨行公式）
  pending.push({
    from: firstLine.to,
    to: firstLine.to,
    deco: Decoration.widget({
      widget: new GfmTableWidget(html),
      side: 1,
    }),
  })

  let pos = block.from
  while (pos < block.to) {
    const line = view.state.doc.lineAt(pos)
    const isFirst = line.number === firstLine.number
    if (!isFirst) {
      pending.push({
        from: line.from,
        to: line.from,
        deco: Decoration.line({ class: 'cm-table-src-hidden' }),
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

function pushEditingTable(
  pending: PendingDecoration[],
  view: EditorView,
  from: number,
  to: number,
) {
  for (const line of tableLines(view, from, to)) {
    pending.push({
      from: line.from,
      to: line.from,
      deco: Decoration.line({ class: 'cm-table-editing' }),
    })
  }
}

function buildTableDecorations(view: EditorView): DecorationSet {
  const head = view.state.selection.main.head
  const doc = view.state.doc.toString()
  const mask = buildPreviewWidgetMask(view, head)
  const pending: PendingDecoration[] = []

  for (const block of scanGfmTableBlocks(doc)) {
    if (cursorInRange(head, block.from, block.to)) {
      pushEditingTable(pending, view, block.from, block.to)
      continue
    }
    const visible = mask.tables.some((t) => t.from === block.from && t.to === block.to)
    if (!visible) continue

    const html = gfmTableMarkdownToHtml(block.markdown)
    pushCollapsedTable(view, pending, block, html)
  }

  return finishPendingDecorations(view, pending)
}

export const tablePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildTableDecorations(view)
    }

    update(update: ViewUpdate) {
      widgetPreviewUpdate(update, this, buildTableDecorations)
    }
  },
  { decorations: (v) => v.decorations },
)
