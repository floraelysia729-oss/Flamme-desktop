/**
 * 文内锚点链接 Live Preview + 点击跳转
 */
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  WidgetType,
  type ViewUpdate,
} from '@codemirror/view'
import { EditorSelection } from '@codemirror/state'
import { buildPreviewWidgetMask } from './preview-context'
import {
  resolveAnchorPos,
  scanAnchorTargets,
  scanInternalMdLinks,
  type InternalMdLink,
} from '../shared/markdownAnchors'
import { saveEditorScroll } from './editorScrollStore'
import { getEditorScrollFilePath } from './editorScrollHandler'
import { finishPendingDecorations, spansMultipleLines, type PendingDecoration } from './decoration-ranges'
import { widgetPreviewUpdate } from './preview-update'
class AnchorLinkWidget extends WidgetType {
  constructor(
    readonly label: string,
    readonly anchorId: string,
  ) {
    super()
  }

  eq(other: WidgetType) {
    return (
      other instanceof AnchorLinkWidget &&
      other.label === this.label &&
      other.anchorId === this.anchorId
    )
  }

  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-md-anchor-link'
    el.setAttribute('role', 'link')
    el.setAttribute('data-md-anchor', this.anchorId)
    el.textContent = this.label
    return el
  }

  ignoreEvent() {
    return false
  }
}

function pushCollapsedAnchorLine(
  pending: PendingDecoration[],
  view: EditorView,
  from: number,
  to: number,
) {
  for (const line of linesInRange(view, from, to)) {
    pending.push({
      from: line.from,
      to: line.from,
      deco: Decoration.line({ class: 'cm-anchor-src-hidden' }),
    })
  }
}

function linesInRange(view: EditorView, from: number, to: number) {
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

function buildAnchorDecorations(view: EditorView): DecorationSet {
  const head = view.state.selection.main.head
  const doc = view.state.doc.toString()
  const mask = buildPreviewWidgetMask(view, head)
  const pending: PendingDecoration[] = []

  for (const link of mask.internalLinks) {
    if (spansMultipleLines(view, link.from, link.to)) continue
    pending.push({
      from: link.from,
      to: link.to,
      replace: true,
      deco: Decoration.replace({
        widget: new AnchorLinkWidget(link.label, link.anchorId),
        inclusive: false,
      }),
    })
  }

  for (const link of scanInternalMdLinks(doc)) {
    if (head >= link.from && head <= link.to) {
      pending.push({
        from: link.from,
        to: link.to,
        deco: Decoration.mark({ class: 'cm-md-anchor-editing' }),
      })
    }
  }

  for (const target of scanAnchorTargets(doc)) {
    if (head >= target.from && head <= target.to) {
      pending.push({
        from: target.from,
        to: target.to,
        deco: Decoration.mark({ class: 'cm-md-anchor-editing' }),
      })
      continue
    }
    const visible = mask.anchorTargets.some(
      (t) => t.from === target.from && t.to === target.to,
    )
    if (visible) {
      pushCollapsedAnchorLine(pending, view, target.from, target.to)
    }
  }

  return finishPendingDecorations(view, pending)
}

export function navigateToPos(view: EditorView, pos: number, filePath?: string | null) {
  view.dispatch({
    selection: EditorSelection.cursor(pos),
    effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 64 }),
  })

  const path = filePath ?? getEditorScrollFilePath()
  if (path) {
    requestAnimationFrame(() => {
      saveEditorScroll(path, pos, view.scrollDOM.scrollTop)
    })
  }
}

export function navigateToAnchor(view: EditorView, anchorId: string, filePath?: string | null) {
  const pos = resolveAnchorPos(view.state.doc.toString(), anchorId)
  if (pos == null) return false
  navigateToPos(view, pos, filePath)
  return true
}

function handleAnchorClick(event: MouseEvent, view: EditorView): boolean {
  const el = (event.target as HTMLElement).closest<HTMLElement>('.cm-md-anchor-link')
  if (!el || !view.dom.contains(el)) return false

  const anchorId = el.getAttribute('data-md-anchor')
  if (!anchorId) return false

  event.preventDefault()
  event.stopPropagation()
  return navigateToAnchor(view, anchorId)
}

export const anchorLinkPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildAnchorDecorations(view)
    }

    update(update: ViewUpdate) {
      widgetPreviewUpdate(update, this, buildAnchorDecorations)
    }
  },
  { decorations: (v) => v.decorations },
)

export const anchorClickHandler = EditorView.domEventHandlers({
  mousedown(event, view) {
    return handleAnchorClick(event, view)
  },
})

export type { InternalMdLink }
