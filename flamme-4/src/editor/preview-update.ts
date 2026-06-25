import { StateEffect } from '@codemirror/state'
import { Decoration, type EditorView, type ViewUpdate } from '@codemirror/view'

/** 滚动停止后触发一次 Widget 装饰重建 */
export const viewportSettledEffect = StateEffect.define<null>()

const SCROLL_SETTLE_MS = 120

let viewportScrollActive = false
let viewportScrollTimer: ReturnType<typeof setTimeout> | null = null

export function onEditorViewportScroll(view: EditorView) {
  viewportScrollActive = true
  if (viewportScrollTimer) clearTimeout(viewportScrollTimer)
  viewportScrollTimer = setTimeout(() => {
    viewportScrollTimer = null
    viewportScrollActive = false
    if (view.dom.isConnected) {
      view.dispatch({ effects: viewportSettledEffect.of(null) })
    }
  }, SCROLL_SETTLE_MS)
}

/** @internal vitest hook */
export function __testSetViewportScrollActive(active: boolean) {
  viewportScrollActive = active
}

function hasViewportSettledEffect(update: ViewUpdate): boolean {
  return (
    update.transactions?.some((t) =>
      t.effects.some((e) => e.is(viewportSettledEffect)),
    ) ?? false
  )
}

function isRangeSelection(update: ViewUpdate): boolean {
  const sel = update.state.selection.main
  return sel.from !== sel.to
}

function selectionChangeNeedsRebuild(update: ViewUpdate): boolean {
  if (!update.selectionSet) return false

  const startSel = update.startState.selection.main
  const sel = update.state.selection.main
  const startRange = startSel.from !== startSel.to
  const range = sel.from !== sel.to

  if (startRange !== range) return true
  if (range) return false

  const oldLine = update.startState.doc.lineAt(startSel.head).number
  const newLine = update.state.doc.lineAt(sel.head).number
  return oldLine !== newLine
}

/** 语法隐藏类装饰（live-preview / block-styles）不依赖视口 */
export function syntaxPreviewShouldRebuild(update: ViewUpdate): boolean {
  if (update.docChanged) return true
  return selectionChangeNeedsRebuild(update)
}

/**
 * Widget 类装饰：大范围拖选时跳过 viewport/selection 抖动；
 * 滚动过程中跳过重建，停止后通过 viewportSettledEffect 统一刷新。
 */
export function widgetPreviewShouldRebuild(update: ViewUpdate): boolean {
  if (update.docChanged) return true
  if (hasViewportSettledEffect(update)) return true
  if (selectionChangeNeedsRebuild(update)) return true
  if (isRangeSelection(update)) return false
  if (update.viewportChanged && viewportScrollActive) return false
  return update.viewportChanged
}

/** @deprecated use syntaxPreviewShouldRebuild or widgetPreviewShouldRebuild */
export function previewPluginShouldRebuild(update: ViewUpdate): boolean {
  return widgetPreviewShouldRebuild(update)
}

type BuildFn = (view: EditorView) => import('@codemirror/view').DecorationSet

const rebuildSlots = new WeakMap<
  object,
  { scheduled: boolean; pendingView: EditorView | null }
>()

function getRebuildSlot(plugin: object) {
  let slot = rebuildSlots.get(plugin)
  if (!slot) {
    slot = { scheduled: false, pendingView: null }
    rebuildSlots.set(plugin, slot)
  }
  return slot
}

/** 整篇替换文档时延迟一帧再建装饰，避免语法树/掩码瞬态跨行 replace */
function deferBuildOnDocChange(
  update: ViewUpdate,
  plugin: { decorations: import('@codemirror/view').DecorationSet },
  build: BuildFn,
): boolean {
  if (!update.docChanged) return false
  const slot = getRebuildSlot(plugin)
  slot.pendingView = update.view
  plugin.decorations = Decoration.none
  if (slot.scheduled) return true
  slot.scheduled = true
  requestAnimationFrame(() => {
    slot.scheduled = false
    const v = slot.pendingView
    slot.pendingView = null
    if (v?.dom.isConnected) {
      plugin.decorations = build(v)
    }
  })
  return true
}

export function widgetPreviewUpdate(
  update: ViewUpdate,
  plugin: { decorations: import('@codemirror/view').DecorationSet },
  build: BuildFn,
): void {
  if (!widgetPreviewShouldRebuild(update)) return
  if (deferBuildOnDocChange(update, plugin, build)) return
  plugin.decorations = build(update.view)
}

/** live-preview / block-styles 等语法隐藏类插件 */
export function syntaxPreviewUpdate(
  update: ViewUpdate,
  plugin: { decorations: import('@codemirror/view').DecorationSet },
  build: BuildFn,
): void {
  if (!syntaxPreviewShouldRebuild(update)) return
  if (deferBuildOnDocChange(update, plugin, build)) return
  plugin.decorations = build(update.view)
}
