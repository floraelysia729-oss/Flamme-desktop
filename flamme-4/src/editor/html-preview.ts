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
  const pending: { from: number; to: number; deco: Decoration }[] = []

  for (const { from, to, html } of mask.html) {
    pending.push({
      from,
      to,
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

export const htmlPreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildHtmlDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildHtmlDecorations(update.view)
      }
    }
  },
  { decorations: (v) => v.decorations },
)
