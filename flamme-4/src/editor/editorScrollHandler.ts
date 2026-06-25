import { EditorView } from '@codemirror/view'
import { onEditorViewportScroll } from './preview-update'

let activeFilePath: string | null = null
const viewFilePaths = new WeakMap<EditorView, string>()
let scrollTimer: ReturnType<typeof setTimeout> | null = null
let scrollView: EditorView | null = null

export function setEditorScrollFilePath(path: string | null) {
  activeFilePath = path
}

export function getEditorScrollFilePath(): string | null {
  return activeFilePath
}

export function registerEditorViewFilePath(view: EditorView, path: string | null) {
  if (path) viewFilePaths.set(view, path)
  else viewFilePaths.delete(view)
}

function filePathForView(view: EditorView): string | null {
  return viewFilePaths.get(view) ?? activeFilePath
}

function scheduleSave(view: EditorView) {
  const path = filePathForView(view)
  if (!path) return
  scrollView = view
  if (scrollTimer) clearTimeout(scrollTimer)
  scrollTimer = setTimeout(() => {
    scrollTimer = null
    const saveView = scrollView
    if (!saveView) return
    const savePath = filePathForView(saveView)
    if (!savePath) return
    void import('./editorScrollStore').then(({ saveEditorScroll }) => {
      saveEditorScroll(savePath, saveView.state.selection.main.head, saveView.scrollDOM.scrollTop)
    })
  }, 500)
}

export const editorScrollHandler = EditorView.domEventHandlers({
  scroll(_event, view) {
    onEditorViewportScroll(view)
    scheduleSave(view)
    return false
  },
})

export const editorSelectionScrollHandler = EditorView.updateListener.of((update) => {
  if (update.selectionSet || update.docChanged) {
    scheduleSave(update.view)
  }
})

export function captureEditorScroll(view: EditorView, filePath: string | null) {
  if (!filePath) return
  void import('./editorScrollStore').then(({ saveEditorScroll }) => {
    saveEditorScroll(filePath, view.state.selection.main.head, view.scrollDOM.scrollTop)
  })
}

export function restoreEditorScroll(view: EditorView, filePath: string | null) {
  if (!filePath) return
  void import('./editorScrollStore').then(({ getEditorScroll }) => {
    const entry = getEditorScroll(filePath)
    if (!entry) return
    const len = view.state.doc.length
    const cursor = Math.min(entry.cursor, len)
    view.dispatch({
      selection: { anchor: cursor, head: cursor },
    })
    requestAnimationFrame(() => {
      view.scrollDOM.scrollTop = entry.scrollTop
    })
  })
}
