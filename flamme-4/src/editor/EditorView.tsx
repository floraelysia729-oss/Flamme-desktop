import { useRef, useEffect, useState, useCallback } from 'react'
import { EditorView as CMEditorView } from '@codemirror/view'
import { EditorSelection, StateEffect } from '@codemirror/state'
import { createEditor, reconfigureEditorTheme } from './create'
import { useFileStore, isVaultMode } from '../files'
import { writeVaultFile } from '../api/bridge'
import { useTheme, isPdfFile } from '../theme/ThemeContext'
import PdfViewer from './PdfViewer'
import { EDITOR_PREVIEW_BUILD } from '../shared/editorBuildStamp'
import {
  captureEditorScroll,
  setEditorScrollFilePath,
} from './editorScrollHandler'
import { getEditorScroll } from './editorScrollStore'
import DocOutline from './DocOutline'
import OutlineRailToggle from './OutlineRailToggle'
import { attachOutlineSpy } from './outlineSpy'
import { scanDocOutline } from '../shared/markdownOutline'
import { useOutlineUiStore } from './outlineUiStore'

export default function EditorView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<CMEditorView | null>(null)
  const prevFileIdRef = useRef<string | null>(null)
  const outlineItemsRef = useRef(scanDocOutline(''))
  const activeFileId = useFileStore((s) => s.activeFileId)
  const nodes = useFileStore((s) => s.nodes)
  const updateContent = useFileStore((s) => s.updateContent)
  const { colors } = useTheme()
  const outlineOpen = useOutlineUiStore((s) => s.open)
  const [docContent, setDocContent] = useState('')
  const [activeOutlineId, setActiveOutlineId] = useState<string | null>(null)
  const [, setViewEpoch] = useState(0)
  const bumpView = useCallback(() => setViewEpoch((n) => n + 1), [])

  const activeNode = activeFileId ? nodes[activeFileId] : null
  const isPdf =
    activeNode?.type === 'file' && activeFileId ? isPdfFile(activeNode.name) : false

  useEffect(() => {
    if (isPdf || !containerRef.current) return
    const view = createEditor(containerRef.current, '', colors)
    viewRef.current = view
    setEditorScrollFilePath(activeFileId)

    const syncDoc = () => {
      const text = view.state.doc.toString()
      setDocContent(text)
      outlineItemsRef.current = scanDocOutline(text)
    }
    syncDoc()

    view.dispatch({
      effects: StateEffect.appendConfig.of(
        CMEditorView.updateListener.of((update) => {
          if (update.docChanged) syncDoc()
        }),
      ),
    })

    bumpView()
    return () => {
      const path = prevFileIdRef.current
      if (path) captureEditorScroll(view, path)
      view.destroy()
      viewRef.current = null
      setEditorScrollFilePath(null)
    }
  }, [isPdf, colors, EDITOR_PREVIEW_BUILD, bumpView])

  useEffect(() => {
    setEditorScrollFilePath(activeFileId)
  }, [activeFileId])

  useEffect(() => {
    const view = viewRef.current
    if (view) reconfigureEditorTheme(view, colors)
  }, [colors, isPdf])

  useEffect(() => {
    const view = viewRef.current
    if (!view || isPdf) return
    return attachOutlineSpy(
      view,
      () => outlineItemsRef.current,
      setActiveOutlineId,
    )
  }, [isPdf, activeFileId, docContent])

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
      captureEditorScroll(view, prevId)
      if (isVaultMode()) {
        void writeVaultFile(prevId, text)
      }
    }

    const newContent = file.content ?? ''
    const len = newContent.length
    const saved = getEditorScroll(activeFileId)
    const cursor = saved ? Math.min(saved.cursor, len) : 0

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: newContent },
      selection: EditorSelection.cursor(cursor),
    })

    setDocContent(newContent)
    outlineItemsRef.current = scanDocOutline(newContent)

    if (saved) {
      requestAnimationFrame(() => {
        view.scrollDOM.scrollTop = saved.scrollTop
      })
    }

    prevFileIdRef.current = activeFileId
  }, [activeFileId, nodes, updateContent, isPdf])

  if (isPdf && activeFileId && activeNode) {
    return <PdfViewer relativePath={activeFileId} fileName={activeNode.name} />
  }

  return (
    <div className="editor-with-outline h-full min-h-0 w-full flex">
      <div
        ref={containerRef}
        className="h-full min-h-0 flex-1 min-w-0"
        data-editor-build={EDITOR_PREVIEW_BUILD}
      />
      {outlineOpen && (
        <DocOutline
          view={viewRef.current}
          filePath={activeFileId}
          content={docContent}
          activeId={activeOutlineId}
        />
      )}
      <OutlineRailToggle disabled={!activeFileId || isPdf} />
    </div>
  )
}
