/**
 * 整行 HTML（表格等）Live Preview — 非光标行渲染为 DOM
 */
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
import { scanHtmlLineBlocks, sanitizeHtmlSnippet } from './html-ranges'
import { finishPendingDecorations, spansMultipleLines } from './decoration-ranges'
import { widgetPreviewUpdate } from './preview-update'

class HtmlPreviewWidget extends WidgetType {
  constructor(readonly html: string) {
    super()
  }

  eq(other: WidgetType) {
    return other instanceof HtmlPreviewWidget && other.html === this.html
  }

  toDOM() {
    const wrap = document.createElement('div')
    wrap.className = 'cm-html-preview'
    wrap.innerHTML = sanitizeHtmlSnippet(this.html)
    return wrap
  }

  ignoreEvent() {
    return true
  }
}

function buildHtmlDecorations(view: EditorView): DecorationSet {
  const head = view.state.selection.main.head
  const mask = buildPreviewWidgetMask(view, head)
  const pending: { from: number; to: number; deco: Decoration; replace?: boolean }[] = []

  for (const { from, to, html } of mask.html) {
    if (spansMultipleLines(view, from, to)) continue
    pending.push({
      from,
      to,
      replace: true,
      deco: Decoration.replace({
        widget: new HtmlPreviewWidget(html),
        inclusive: false,
      }),
    })
  }

  for (const { from, to } of scanHtmlLineBlocks(view.state.doc.toString())) {
    if (head >= from && head <= to) {
      pending.push({
        from,
        to,
        deco: Decoration.mark({ class: 'cm-html-editing' }),
      })
    }
  }

  return finishPendingDecorations(view, pending)
}

export const htmlPreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildHtmlDecorations(view)
    }

    update(update: ViewUpdate) {
      widgetPreviewUpdate(update, this, buildHtmlDecorations)
    }
  },
  { decorations: (v) => v.decorations },
)
