import { useCallback, useEffect, useRef } from 'react'
import { getFileStore, useFileStore, isVaultMode } from '../files'
import {
  getPaneActiveFile,
  useEditorSplitStore,
} from './editorSplitStore'
import EditorPane from './EditorPane'
import { prefetchPaneTab } from './PaneTabBar'

const MIN_PANE_FLEX = 0.25

export default function EditorWorkspace() {
  const panes = useEditorSplitStore((s) => s.panes)
  const focusedPaneId = useEditorSplitStore((s) => s.focusedPaneId)
  const weights = useEditorSplitStore((s) => s.weights)
  const hydrated = useEditorSplitStore((s) => s._hydrated)
  const focusPane = useEditorSplitStore((s) => s.focusPane)
  const setWeights = useEditorSplitStore((s) => s.setWeights)
  const syncPrimaryFile = useEditorSplitStore((s) => s.syncPrimaryFile)
  const activeFileId = useFileStore((s) => s.activeFileId)
  const vaultReady = useFileStore((s) => (isVaultMode() ? s.ready === true : true))
  const dragging = useRef<number | null>(null)
  const latestWeights = useRef(weights)
  const restoredRef = useRef(false)

  useEffect(() => {
    latestWeights.current = weights
  }, [weights])

  useEffect(() => {
    syncPrimaryFile(activeFileId)
  }, [activeFileId, syncPrimaryFile])

  useEffect(() => {
    if (!hydrated || !vaultReady || restoredRef.current) return
    restoredRef.current = true
    const nodes = getFileStore().nodes
    const split = useEditorSplitStore.getState()
    split.sanitizePanes(nodes)
    const { panes: nextPanes, focusedPaneId: focusId } = useEditorSplitStore.getState()
    const focused = nextPanes.find((p) => p.id === focusId)
    const activeId = focused ? getPaneActiveFile(focused) : null
    if (activeId) {
      void getFileStore().openFile(activeId)
    }
    for (const pane of nextPanes) {
      if (pane.id === focusId) continue
      const tabId = getPaneActiveFile(pane)
      if (tabId) void prefetchPaneTab(tabId)
    }
  }, [hydrated, vaultReady])

  const onResizeStart = useCallback(
    (index: number, e: React.MouseEvent) => {
      e.preventDefault()
      dragging.current = index
      const startX = e.clientX
      const container = (e.currentTarget as HTMLElement).closest('.editor-workspace')
      if (!container) return
      const rect = container.getBoundingClientRect()
      const startWeights = [...latestWeights.current]
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'

      const onMove = (ev: MouseEvent) => {
        if (dragging.current === null) return
        const total = startWeights.reduce((a, b) => a + b, 0)
        const deltaRatio = (ev.clientX - startX) / rect.width
        const left = Math.max(
          MIN_PANE_FLEX * total,
          Math.min(
            startWeights[index] + startWeights[index + 1] - MIN_PANE_FLEX * total,
            startWeights[index] + deltaRatio * total,
          ),
        )
        const pairSum = startWeights[index] + startWeights[index + 1]
        const next = [...startWeights]
        next[index] = left
        next[index + 1] = pairSum - left
        latestWeights.current = next
        setWeights(next)
      }

      const onUp = () => {
        dragging.current = null
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }

      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [setWeights],
  )

  return (
    <div className="editor-workspace h-full min-h-0 w-full flex">
      {panes.map((pane, i) => {
        const fileId = getPaneActiveFile(pane)
        return (
          <div key={pane.id} className="contents">
            <div
              className="editor-pane-slot h-full min-h-0 min-w-0 flex flex-col"
              style={{ flex: weights[i] ?? 1 }}
            >
              <EditorPane
                paneId={pane.id}
                tabIds={pane.tabIds}
                activeTabId={pane.activeTabId}
                fileId={fileId}
                isFocused={pane.id === focusedPaneId}
                onFocus={() => {
                  focusPane(pane.id)
                  if (fileId) {
                    void Promise.resolve(getFileStore().openFile(fileId))
                  }
                }}
              />
            </div>
            {i < panes.length - 1 && (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="调整分屏宽度"
                title="拖动调整分屏宽度"
                className="editor-pane-resizer shrink-0 w-1.5 cursor-col-resize hover:bg-[var(--accent)]/25 active:bg-[var(--accent)]/40 transition-colors"
                onMouseDown={(e) => onResizeStart(i, e)}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
