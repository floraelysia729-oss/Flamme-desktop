/**
 * Obsidian 风格 [[wikilink]] — Widget 预览 + 右键/Ctrl+点击跳转
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
import { getFileStore } from '../files'
import { openFileInEditor } from './openFileInEditor'
import { parseWikilinkTarget, resolveVaultLink } from '../chat/resolveVaultLink'
import { buildPreviewWidgetMask } from './preview-context'
import { scanWikilinks } from './wikilink-ranges'
import { finishPendingDecorations, spansMultipleLines } from './decoration-ranges'
import { widgetPreviewShouldRebuild, widgetPreviewUpdate } from './preview-update'

class WikilinkWidget extends WidgetType {
  constructor(readonly title: string) {
    super()
  }

  eq(other: WidgetType) {
    return other instanceof WikilinkWidget && other.title === this.title
  }

  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-wikilink'
    span.setAttribute('data-wikilink', this.title)
    span.textContent = this.title
    return span
  }

  /** 允许悬停/点击事件传到编辑器层处理 */
  ignoreEvent() {
    return false
  }
}

function buildWikilinks(view: EditorView): DecorationSet {
  const head = view.state.selection.main.head
  const doc = view.state.doc.toString()
  const mask = buildPreviewWidgetMask(view, head)
  const pending: { from: number; to: number; deco: Decoration; replace?: boolean }[] = []

  for (const { from, to, title } of mask.wikilinks) {
    if (spansMultipleLines(view, from, to)) continue
    pending.push({
      from,
      to,
      replace: true,
      deco: Decoration.replace({
        widget: new WikilinkWidget(title),
        inclusive: false,
      }),
    })
  }

  for (const { from, to, title } of scanWikilinks(doc)) {
    if (head < from || head > to) continue
    pending.push({
      from,
      to,
      deco: Decoration.mark({
        class: 'cm-wikilink cm-wikilink-editing',
        attributes: { 'data-wikilink': title },
      }),
    })
  }

  pending.sort((a, b) => a.from - b.from || a.to - b.to)

  return finishPendingDecorations(view, pending)
}

export const wikilinkPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildWikilinks(view)
    }

    update(update: ViewUpdate) {
      widgetPreviewUpdate(update, this, buildWikilinks)
    }
  },
  { decorations: (v) => v.decorations },
)

function navigateWikilink(event: MouseEvent, newPane = false): boolean {
  const el = (event.target as HTMLElement).closest('.cm-wikilink')
  let title: string | null = null
  if (el) {
    const raw = el.getAttribute('data-wikilink')
    if (raw) title = parseWikilinkTarget(raw)
  }
  if (!title) return false

  event.preventDefault()
  event.stopPropagation()

  const path = resolveVaultLink(title, getFileStore().nodes)
  if (path) {
    void openFileInEditor(path, { newPane })
    return true
  }

  window.dispatchEvent(
    new CustomEvent('flamme:wikilink-miss', { detail: { title } }),
  )
  return true
}

export const wikilinkClickHandler = EditorView.domEventHandlers({
  contextmenu(event) {
    return navigateWikilink(event)
  },
  mousedown(event) {
    if (!(event.ctrlKey || event.metaKey)) return false
    const newPane = event.shiftKey
    return navigateWikilink(event, newPane)
  },
  auxclick(event) {
    if (event.button !== 1) return false
    return navigateWikilink(event, true)
  },
})
