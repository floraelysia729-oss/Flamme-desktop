import { EditorView } from '@codemirror/view'
import { EditorSelection } from '@codemirror/state'
import { useWorkspaceStore } from '../shared/workspaceStore'
import { useEditorQuoteStore, type EditorQuote } from '../shared/editorQuoteStore'
import { buildQuoteFromSelection } from '../shared/formatEditorQuote'
import { getEditorScrollFilePath } from './editorScrollHandler'

const DEBOUNCE_MS = 200

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let activeEditorView: EditorView | null = null
let dismissedRangeKey: string | null = null

function fileNameFromPath(filePath: string): string {
  const norm = filePath.replace(/\\/g, '/')
  const idx = norm.lastIndexOf('/')
  return idx >= 0 ? norm.slice(idx + 1) : norm
}

function selectionRangeKey(filePath: string, from: number, to: number): string {
  const start = Math.min(from, to)
  const end = Math.max(from, to)
  return `${filePath.replace(/\\/g, '/')}:${start}:${end}`
}

export function registerActiveEditorView(view: EditorView | null) {
  activeEditorView = view
}

export function cancelPendingQuoteSync() {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
}

/** 换对话时清除引用条，但保留编辑器选区；阻止防抖立即重新引用 */
export function suppressQuoteResync(clearedQuote: EditorQuote | null) {
  cancelPendingQuoteSync()
  if (clearedQuote?.filePath && clearedQuote.from !== clearedQuote.to) {
    dismissedRangeKey = selectionRangeKey(
      clearedQuote.filePath,
      clearedQuote.from,
      clearedQuote.to,
    )
    return
  }
  const view = activeEditorView
  const filePath = getEditorScrollFilePath()
  if (!view || !filePath) return
  const sel = view.state.selection.main
  if (sel.from !== sel.to) {
    dismissedRangeKey = selectionRangeKey(filePath, sel.from, sel.to)
  }
}

/** 清除引用时收起选区，并阻止同选区立即被防抖重新引用 */
export function dismissEditorQuoteSelection() {
  cancelPendingQuoteSync()
  const view = activeEditorView
  if (!view) return

  const sel = view.state.selection.main
  const filePath = getEditorScrollFilePath()
  if (filePath && sel.from !== sel.to) {
    dismissedRangeKey = selectionRangeKey(filePath, sel.from, sel.to)
  }

  const head = sel.head
  view.dispatch({ selection: EditorSelection.cursor(head) })
}

function pushSelectionQuote(view: EditorView) {
  const filePath = getEditorScrollFilePath()
  if (!filePath) return

  const sel = view.state.selection.main
  const normPath = filePath.replace(/\\/g, '/')
  const rangeKey = selectionRangeKey(normPath, sel.from, sel.to)
  if (dismissedRangeKey === rangeKey) return

  const quote = buildQuoteFromSelection(
    normPath,
    fileNameFromPath(normPath),
    view.state.doc,
    sel.from,
    sel.to,
  )
  if (!quote) return

  useEditorQuoteStore.getState().setQuote(quote)
}

function scheduleSelectionQuote(view: EditorView) {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    pushSelectionQuote(view)
  }, DEBOUNCE_MS)
}

export const selectionQuoteSync = EditorView.updateListener.of((update) => {
  if (!update.selectionSet) return
  if (useWorkspaceStore.getState().mode !== 'split') return

  const sel = update.state.selection.main
  if (sel.from === sel.to) return

  const filePath = getEditorScrollFilePath()
  if (filePath) {
    const rangeKey = selectionRangeKey(filePath, sel.from, sel.to)
    if (dismissedRangeKey && rangeKey !== dismissedRangeKey) {
      dismissedRangeKey = null
    }
  }

  scheduleSelectionQuote(update.view)
})

export function quoteSelectionNow(view: EditorView): boolean {
  const sel = view.state.selection.main
  if (sel.from === sel.to) return false

  const filePath = getEditorScrollFilePath()
  if (!filePath) return false

  const quote = buildQuoteFromSelection(
    filePath,
    fileNameFromPath(filePath),
    view.state.doc,
    sel.from,
    sel.to,
  )
  if (!quote) return false

  useEditorQuoteStore.getState().setQuote(quote)
  return true
}

export function focusChatInput() {
  window.dispatchEvent(new CustomEvent('flamme:focus-chat-input'))
}

export function openSplitWithQuote() {
  useWorkspaceStore.getState().setMode('split')
  focusChatInput()
}
