import { EditorView } from '@codemirror/view'

let activeFilePath: string | null = null
let scrollTimer: ReturnType<typeof setTimeout> | null = null

export function setEditorScrollFilePath(path: string | null) {
  activeFilePath = path
}

export function getEditorScrollFilePath(): string | null {
  return activeFilePath
}

function scheduleSave(view: EditorView) {
  if (!activeFilePath) return
  if (scrollTimer) clearTimeout(scrollTimer)
  scrollTimer = setTimeout(() => {
    scrollTimer = null
    void import('./editorScrollStore').then(({ saveEditorScroll }) => {
      if (!activeFilePath) return
      saveEditorScroll(
        activeFilePath,
        view.state.selection.main.head,
        view.scrollDOM.scrollTop,
      )
    })
  }, 500)
}

export const editorScrollHandler = EditorView.domEventHandlers({
  scroll(_event, view) {
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
