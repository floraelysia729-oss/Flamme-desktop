import { StateEffect } from '@codemirror/state'
import { RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view'
import { useEditorQuoteStore } from '../shared/editorQuoteStore'
import { getEditorScrollFilePath } from './editorScrollHandler'

export const refreshQuoteHighlightEffect = StateEffect.define<null>()

function buildQuoteHighlight(view: EditorView): DecorationSet {
  const quote = useEditorQuoteStore.getState().quote
  const filePath = getEditorScrollFilePath()?.replace(/\\/g, '/')
  if (!quote || !filePath || quote.filePath !== filePath) {
    return Decoration.none
  }

  const len = view.state.doc.length
  const from = Math.max(0, Math.min(quote.from, len))
  const to = Math.max(from, Math.min(quote.to, len))
  if (from === to) return Decoration.none

  const builder = new RangeSetBuilder<Decoration>()
  builder.add(from, to, Decoration.mark({ class: 'cm-quote-highlight' }))
  return builder.finish()
}

export const quoteHighlightPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    private unsub: () => void

    constructor(view: EditorView) {
      this.decorations = buildQuoteHighlight(view)
      this.unsub = useEditorQuoteStore.subscribe(() => {
        requestAnimationFrame(() => {
          if (!view.dom.isConnected) return
          view.dispatch({ effects: refreshQuoteHighlightEffect.of(null) })
        })
      })
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.transactions.some((t) =>
          t.effects.some((e) => e.is(refreshQuoteHighlightEffect)),
        )
      ) {
        this.decorations = buildQuoteHighlight(update.view)
      }
    }

    destroy() {
      this.unsub()
    }
  },
  { decorations: (v) => v.decorations },
)
