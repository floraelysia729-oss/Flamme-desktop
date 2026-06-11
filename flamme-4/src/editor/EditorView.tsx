import { useRef, useEffect } from 'react'
import { EditorView as CMEditorView } from '@codemirror/view'
import { EditorSelection } from '@codemirror/state'
import { createEditor, reconfigureEditorTheme } from './create'
import { useFileStore, isVaultMode } from '../files'
import { writeVaultFile } from '../api/bridge'
import { useTheme, isPdfFile } from '../theme/ThemeContext'
import PdfViewer from './PdfViewer'
import { EDITOR_PREVIEW_BUILD } from '../shared/editorBuildStamp'

export default function EditorView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<CMEditorView | null>(null)
  const prevFileIdRef = useRef<string | null>(null)
  const activeFileId = useFileStore((s) => s.activeFileId)
  const nodes = useFileStore((s) => s.nodes)
  const updateContent = useFileStore((s) => s.updateContent)
  const { colors } = useTheme()

  const activeNode = activeFileId ? nodes[activeFileId] : null
  const isPdf =
    activeNode?.type === 'file' && activeFileId ? isPdfFile(activeNode.name) : false

  useEffect(() => {
    if (isPdf || !containerRef.current) return
    viewRef.current = createEditor(containerRef.current, '', colors)
    return () => {
      viewRef.current?.destroy()
      viewRef.current = null
    }
  }, [isPdf, colors, EDITOR_PREVIEW_BUILD])

  useEffect(() => {
    const view = viewRef.current
    if (view) reconfigureEditorTheme(view, colors)
  }, [colors, isPdf])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (!activeFileId || isPdf) return
        const view = viewRef.current
        if (!view) return
        const text = view.state.doc.toString()
        updateContent(activeFileId, text)
        if (isVaultMode()) {
          void writeVaultFile(activeFileId, text)
        } else {
          void import('../shell/io').then(({ saveFile }) => saveFile(null, text))
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeFileId, isPdf, updateContent])

  useEffect(() => {
    const view = viewRef.current
    if (!view || !activeFileId || isPdf) return

    const file = nodes[activeFileId]
    if (!file || file.type !== 'file') return

    const prevId = prevFileIdRef.current
    if (prevId && prevId !== activeFileId && nodes[prevId]?.type === 'file' && !isPdfFile(nodes[prevId].name)) {
      const text = view.state.doc.toString()
      updateContent(prevId, text)
      if (isVaultMode()) {
        void writeVaultFile(prevId, text)
      }
    }

    const newContent = file.content ?? ''
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: newContent },
      selection: EditorSelection.cursor(0),
    })

    prevFileIdRef.current = activeFileId
  }, [activeFileId, nodes, updateContent, isPdf])

  if (isPdf && activeFileId && activeNode) {
    return <PdfViewer relativePath={activeFileId} fileName={activeNode.name} />
  }

  return <div ref={containerRef} className="h-full min-h-0 w-full" data-editor-build={EDITOR_PREVIEW_BUILD} />
}
