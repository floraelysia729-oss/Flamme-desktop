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
  registerEditorViewFilePath,
  setEditorScrollFilePath,
} from './editorScrollHandler'
import { getEditorScroll } from './editorScrollStore'
import DocOutline from './DocOutline'
import PaneOutlineRailToggle from './PaneOutlineRailToggle'
import { attachOutlineSpy } from './outlineSpy'
import { scanDocOutline } from '../shared/markdownOutline'
import { useWorkspaceStore } from '../shared/workspaceStore'
import ContextMenu from '../shell/ContextMenu'
import {
  openSplitWithQuote,
  quoteSelectionNow,
  registerActiveEditorView,
} from './selectionQuote'
import { useEditorSplitStore, getPaneActiveFile } from './editorSplitStore'
import PaneTabBar from './PaneTabBar'
import { selectEditorTab } from './openFileInEditor'

interface EditorPaneProps {
  paneId: string
  tabIds: string[]
  activeTabId: string | null
  fileId: string | null
  isFocused: boolean
  onFocus: () => void
}

export default function EditorPane({
  paneId,
  tabIds,
  activeTabId,
  fileId,
  isFocused,
  onFocus,
}: EditorPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<CMEditorView | null>(null)
  const prevFileIdRef = useRef<string | null>(null)
  const outlineItemsRef = useRef(scanDocOutline(''))
  const outlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nodes = useFileStore((s) => s.nodes)
  const fileContent =
    fileId && nodes[fileId]?.type === 'file' ? (nodes[fileId].content ?? '') : undefined
  const updateContent = useFileStore((s) => s.updateContent)
  const { colors } = useTheme()
  const outlineOpen = useEditorSplitStore((s) => s.paneUi[paneId]?.outlineOpen ?? false)
  const [docContent, setDocContent] = useState('')
  const [activeOutlineId, setActiveOutlineId] = useState<string | null>(null)
  const [viewEpoch, setViewEpoch] = useState(0)
  const [quoteMenu, setQuoteMenu] = useState<{ x: number; y: number } | null>(null)
  const closePane = useEditorSplitStore((s) => s.closePane)
  const closeTab = useEditorSplitStore((s) => s.closeTab)
  const splitRight = useEditorSplitStore((s) => s.splitRight)
  const paneCount = useEditorSplitStore((s) => s.panes.length)

  const handleCloseTab = useCallback(
    (tabId: string) => {
      const wasActive = activeTabId === tabId
      closeTab(paneId, tabId)
      if (!wasActive) return
      const pane = useEditorSplitStore.getState().panes.find((p) => p.id === paneId)
      const nextId = pane ? getPaneActiveFile(pane) : null
      if (nextId) {
        void selectEditorTab(paneId, nextId)
      }
    },
    [activeTabId, closeTab, paneId],
  )

  const handleSelectTab = useCallback(
    (tabId: string) => {
      void selectEditorTab(paneId, tabId)
    },
    [paneId],
  )
  const bumpView = useCallback(() => setViewEpoch((n) => n + 1), [])

  const fileNode = fileId ? nodes[fileId] : null
  const isPdf = fileNode?.type === 'file' && fileId ? isPdfFile(fileNode.name) : false

  useEffect(() => {
    if (isPdf || !containerRef.current) return
    const view = createEditor(containerRef.current, '', colors)
    viewRef.current = view
    if (fileId) registerEditorViewFilePath(view, fileId)
    if (isFocused) {
      registerActiveEditorView(view)
      setEditorScrollFilePath(fileId)
    }

    const syncDoc = () => {
      const text = view.state.doc.toString()
      if (outlineTimerRef.current) clearTimeout(outlineTimerRef.current)
      outlineTimerRef.current = setTimeout(() => {
        outlineTimerRef.current = null
        setDocContent(text)
        outlineItemsRef.current = scanDocOutline(text)
      }, 250)
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
    requestAnimationFrame(() => {
      requestAnimationFrame(() => view.requestMeasure())
    })
    return () => {
      if (outlineTimerRef.current) clearTimeout(outlineTimerRef.current)
      const path = prevFileIdRef.current
      if (path) captureEditorScroll(view, path)
      registerEditorViewFilePath(view, null)
      view.destroy()
      viewRef.current = null
      if (isFocused) {
        registerActiveEditorView(null)
        setEditorScrollFilePath(null)
      }
    }
  }, [isPdf, EDITOR_PREVIEW_BUILD, bumpView])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    registerEditorViewFilePath(view, fileId)
    if (isFocused) {
      registerActiveEditorView(view)
      setEditorScrollFilePath(fileId)
    }
  }, [fileId, isFocused])

  useEffect(() => {
    const view = viewRef.current
    if (view) reconfigureEditorTheme(view, colors)
  }, [colors, isPdf])

  useEffect(() => {
    const view = viewRef.current
    if (!view || isPdf) return
    return attachOutlineSpy(view, () => outlineItemsRef.current, setActiveOutlineId)
  }, [isPdf, fileId, viewEpoch])

  useEffect(() => {
    const view = viewRef.current
    if (!view || isPdf || !isFocused) return

    const onContextMenu = (e: MouseEvent) => {
      if (useWorkspaceStore.getState().mode !== 'read') return
      if ((e.target as HTMLElement).closest('.cm-wikilink')) return

      const sel = view.state.selection.main
      if (sel.from === sel.to) return

      e.preventDefault()
      setQuoteMenu({ x: e.clientX, y: e.clientY })
    }

    view.dom.addEventListener('contextmenu', onContextMenu)
    return () => view.dom.removeEventListener('contextmenu', onContextMenu)
  }, [isPdf, viewEpoch, fileId, isFocused])

  useEffect(() => {
    if (!isFocused) return
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (!fileId || isPdf) return
        const view = viewRef.current
        if (!view) return
        const text = view.state.doc.toString()
        updateContent(fileId, text)
        if (isVaultMode()) {
          void writeVaultFile(fileId, text)
        } else {
          void import('../shell/io').then(({ saveFile }) => saveFile(null, text))
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [fileId, isPdf, updateContent, isFocused])

  useEffect(() => {
    const view = viewRef.current
    if (!view || !fileId || isPdf || fileContent === undefined) return

    const file = nodes[fileId]
    if (!file || file.type !== 'file') return

    const prevId = prevFileIdRef.current
    const fileChanged = prevId !== fileId
    if (prevId && fileChanged && nodes[prevId]?.type === 'file' && !isPdfFile(nodes[prevId].name)) {
      const text = view.state.doc.toString()
      const storedText = nodes[prevId].content ?? ''
      const editorDesyncedEmpty = text === '' && storedText.length > 0
      if (!editorDesyncedEmpty && text !== storedText) {
        updateContent(prevId, text)
        captureEditorScroll(view, prevId)
        if (isVaultMode()) {
          void writeVaultFile(prevId, text)
        }
      }
    }

    const newContent = fileContent
    const currentContent = view.state.doc.toString()
    const len = newContent.length
    const saved = getEditorScroll(fileId)
    const cursor = saved ? Math.min(saved.cursor, len) : 0
    const contentChanged = currentContent !== newContent

    if (!fileChanged && !contentChanged) {
      return
    }

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: newContent },
      selection: EditorSelection.cursor(cursor),
    })

    setDocContent(newContent)
    outlineItemsRef.current = scanDocOutline(newContent)

    if (saved && (fileChanged || contentChanged)) {
      requestAnimationFrame(() => {
        view.scrollDOM.scrollTop = saved.scrollTop
      })
    }

    prevFileIdRef.current = fileId
  }, [fileId, fileContent, updateContent, isPdf, viewEpoch])

  const handlePaneMouseDown = () => {
    if (!isFocused) onFocus()
  }

  const tabBar = (
    <PaneTabBar
      paneId={paneId}
      tabIds={tabIds}
      activeTabId={activeTabId}
      paneCount={paneCount}
      isFocused={isFocused}
      onSelectTab={handleSelectTab}
      onCloseTab={handleCloseTab}
      onSplit={splitRight}
      onClosePane={() => closePane(paneId)}
    />
  )

  if (isPdf && fileId && fileNode) {
    return (
      <div
        className={`editor-pane h-full min-h-0 flex flex-col ${isFocused ? 'editor-pane--focused' : ''}`}
        onMouseDown={handlePaneMouseDown}
      >
        {tabBar}
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="editor-with-outline flex-1 min-h-0 w-full flex relative">
            <div className="flex-1 min-h-0">
              <PdfViewer relativePath={fileId} fileName={fileNode.name} />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`editor-pane h-full min-h-0 flex flex-col ${isFocused ? 'editor-pane--focused' : ''}`}
      onMouseDown={handlePaneMouseDown}
    >
      {tabBar}
      <div className="editor-with-outline flex-1 min-h-0 w-full flex relative">
        <div
          ref={containerRef}
          className="h-full min-h-0 flex-1 min-w-0"
          data-editor-build={EDITOR_PREVIEW_BUILD}
        />
        {outlineOpen && (
          <DocOutline
            view={viewRef.current}
            filePath={fileId}
            content={docContent}
            activeId={activeOutlineId}
          />
        )}
        <PaneOutlineRailToggle paneId={paneId} disabled={!fileId || isPdf} />
        {quoteMenu && (
          <ContextMenu
            x={quoteMenu.x}
            y={quoteMenu.y}
            items={[
              {
                label: '引用并分屏',
                onClick: () => {
                  const view = viewRef.current
                  if (view && quoteSelectionNow(view)) {
                    openSplitWithQuote()
                  }
                },
              },
            ]}
            onClose={() => setQuoteMenu(null)}
          />
        )}
      </div>
    </div>
  )
}
