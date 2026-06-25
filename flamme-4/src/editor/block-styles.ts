/**
 * 围栏代码块 / 引用块行级样式 — 与 inline code 区分
 */
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import { RangeSetBuilder } from '@codemirror/state'
import { blockquoteFenceLineRange } from './blockquote-code'
import { syntaxPreviewUpdate } from './preview-update'

const fencedLine = Decoration.line({ class: 'cm-fenced-code-line' })
const quoteLine = Decoration.line({ class: 'cm-blockquote-line' })

function lineDecoForNode(view: EditorView, from: number, to: number, deco: Decoration) {
  const out: { pos: number; deco: Decoration }[] = []
  let pos = from
  while (pos <= to) {
    const line = view.state.doc.lineAt(pos)
    out.push({ pos: line.from, deco })
    if (line.to >= to) break
    pos = line.to + 1
  }
  return out
}

function blockquoteFencedLines(view: EditorView): { pos: number; deco: Decoration }[] {
  const out: { pos: number; deco: Decoration }[] = []
  for (const { from, to } of blockquoteFenceLineRange(view.state.doc)) {
    let pos = from
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos)
      out.push({ pos: line.from, deco: fencedLine })
      if (line.to >= to) break
      pos = line.to + 1
    }
  }
  return out
}

function buildBlockStyles(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const pending: { pos: number; deco: Decoration }[] = []
  const bqFenceLines = new Set(
    blockquoteFencedLines(view).map((x) => x.pos),
  )

  syntaxTree(view.state).iterate({
    enter(node) {
      if (node.name === 'FencedCode' || node.name === 'CodeBlock') {
        pending.push(...lineDecoForNode(view, node.from, node.to, fencedLine))
      } else if (node.name === 'Blockquote') {
        for (const { pos, deco } of lineDecoForNode(view, node.from, node.to, quoteLine)) {
          if (!bqFenceLines.has(pos)) pending.push({ pos, deco })
        }
      }
    },
  })

  pending.push(...blockquoteFencedLines(view))

  pending.sort((a, b) => a.pos - b.pos)
  for (const { pos, deco } of pending) {
    builder.add(pos, pos, deco)
  }

  return builder.finish()
}

export const blockStylePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildBlockStyles(view)
    }

    update(update: ViewUpdate) {
      syntaxPreviewUpdate(update, this, buildBlockStyles)
    }
  },
  { decorations: (v) => v.decorations },
)
