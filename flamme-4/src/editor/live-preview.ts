/**
 * CM6 Live Preview — hide markdown syntax markers on non-cursor lines.
 *
 * The cursor line shows raw markdown; all other lines have their
 * formatting markers (#, **, *, `, etc.) hidden so content looks rendered.
 * Visual styling (colors, sizes, bold, italic) comes from HighlightStyle.
 */
import {
  ViewPlugin, ViewUpdate, Decoration, type DecorationSet, EditorView,
} from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import { blockquoteFenceLineRange, lineInBlockquoteFence } from './blockquote-code'
import { buildPreviewWidgetMask, posInRanges } from './preview-context'
import { pushHideReplaceRanges, finishPendingDecorations } from './decoration-ranges'
import { syntaxPreviewUpdate } from './preview-update'

// Shared decoration instances (avoid creating new ones per range)
const hide = Decoration.replace({})

const livePreview = ViewPlugin.fromClass(class {
  decorations: DecorationSet

  constructor(view: EditorView) {
    this.decorations = build(view)
  }

  update(update: ViewUpdate) {
    syntaxPreviewUpdate(update, this, build)
  }
}, {
  decorations: v => v.decorations,
})

function build(view: EditorView): DecorationSet {
  const cursor = view.state.selection.main.head
  const cursorLine = view.state.doc.lineAt(cursor).number
  const mask = buildPreviewWidgetMask(view, cursor)
  const fmWidget = mask.frontmatter

  const ranges: { from: number; to: number }[] = []

  // Collect nodes to hide — only on non-cursor lines
  const tree = syntaxTree(view.state)
  tree.iterate({
    enter(node) {
      if (fmWidget && node.from >= fmWidget.from && node.to <= fmWidget.to) return

      if (
        posInRanges(node.from, mask.wikilinks) ||
        posInRanges(node.to, mask.wikilinks) ||
        posInRanges(node.from, mask.math) ||
        posInRanges(node.to, mask.math) ||
        posInRanges(node.from, mask.html) ||
        posInRanges(node.to, mask.html) ||
        posInRanges(node.from, mask.tables) ||
        posInRanges(node.to, mask.tables) ||
        posInRanges(node.from, mask.fencedCode) ||
        posInRanges(node.to, mask.fencedCode) ||
        posInRanges(node.from, mask.internalLinks) ||
        posInRanges(node.to, mask.internalLinks) ||
        posInRanges(node.from, mask.anchorTargets) ||
        posInRanges(node.to, mask.anchorTargets)
      ) {
        return
      }


      const nodeLine = view.state.doc.lineAt(node.from).number
      const nodeEndLine = view.state.doc.lineAt(node.to).number

      // Skip if node overlaps with cursor line
      if (nodeLine <= cursorLine && nodeEndLine >= cursorLine) return

      switch (node.name) {
        // Heading # markers
        case 'HeaderMark':
          pushHideReplaceRanges(view, ranges, node.from, node.to)
          break

        // Bold/italic ** * markers
        case 'EmphasisMark':
          pushHideReplaceRanges(view, ranges, node.from, node.to)
          break

        // Inline code ` markers (but not fenced code block ```)
        case 'CodeMark': {
          const parent = node.node.parent
          const lineNo = view.state.doc.lineAt(node.from).number
          const inBqFence = lineInBlockquoteFence(view.state.doc, lineNo)
          if (parent && parent.name === 'InlineCode') {
            pushHideReplaceRanges(view, ranges, node.from, node.to)
          } else if (parent && parent.name === 'FencedCode') {
            pushHideReplaceRanges(view, ranges, node.from, node.to)
          } else if (inBqFence) {
            pushHideReplaceRanges(view, ranges, node.from, node.to)
          }
          break
        }

        // 引用块行首 > （代码围栏行保留 > 后的内容结构）
        case 'QuoteMark': {
          const line = view.state.doc.lineAt(node.from)
          if (!/^\s*>\s*```/.test(line.text)) {
            pushHideReplaceRanges(view, ranges, node.from, node.to)
          }
          break
        }

        // Link delimiters [ ] ( )
        case 'LinkMark':
          pushHideReplaceRanges(view, ranges, node.from, node.to)
          break

        // URL inside link — hide the actual URL
        case 'URL':
          pushHideReplaceRanges(view, ranges, node.from, node.to)
          break

        // List item markers (- * 1.)
        case 'ListMark':
          pushHideReplaceRanges(view, ranges, node.from, node.to)
          break

        // Horizontal rule markers
        case 'HorizontalRule':
          // Replace with a thin line widget
          break

        // Strikethrough ~~ markers
        case 'StrikethroughMark':
          pushHideReplaceRanges(view, ranges, node.from, node.to)
          break

        // YAML frontmatter --- delimiters (skip — frontmatter-preview handles display)
        case 'DashLine':
          break
      }
    },
  })

  // 引用块内围栏代码：隐藏行首 >，保留代码正文换行
  for (const { from, to } of blockquoteFenceLineRange(view.state.doc)) {
    let pos = from
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos)
      if (line.number !== cursorLine) {
        const prefix = line.text.match(/^(\s*>\s*)/)
        if (prefix) {
          pushHideReplaceRanges(
            view,
            ranges,
            line.from,
            line.from + prefix[1].length,
          )
        }
      }
      if (line.to >= to) break
      pos = line.to + 1
    }
  }

  const pending = ranges.map((r) => ({
    from: r.from,
    to: r.to,
    deco: hide,
    replace: true as const,
  }))
  return finishPendingDecorations(view, pending)
}

export { livePreview }
