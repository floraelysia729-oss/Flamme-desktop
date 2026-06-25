import { Columns2, X } from 'lucide-react'
import { getFileStore, useFileStore } from '../files'
import { isPdfFile } from '../theme/ThemeContext'

interface Props {
  paneId: string
  tabIds: string[]
  activeTabId: string | null
  paneCount: number
  isFocused: boolean
  onSelectTab: (fileId: string) => void
  onCloseTab: (fileId: string) => void
  onSplit: () => void
  onClosePane: () => void
}

export default function PaneTabBar({
  tabIds,
  activeTabId,
  paneCount,
  isFocused,
  onSelectTab,
  onCloseTab,
  onSplit,
  onClosePane,
}: Props) {
  const nodes = useFileStore((s) => s.nodes)

  return (
    <div
      className={`editor-tab-bar flex items-stretch shrink-0 min-h-0 border-b border-white/[0.06] ${
        isFocused ? 'editor-tab-bar--focused' : ''
      }`}
    >
      <div className="editor-tab-bar-tabs flex-1 min-w-0 flex items-stretch overflow-x-auto">
        {tabIds.length === 0 ? (
          <span className="editor-tab editor-tab--empty px-3 text-xs text-[var(--ink-muted)] self-center">
            未打开文件
          </span>
        ) : (
          tabIds.map((tabId) => {
            const node = nodes[tabId]
            const name = node?.name ?? tabId.split('/').pop() ?? tabId
            const isActive = activeTabId === tabId
            return (
              <div
                key={tabId}
                className={`editor-tab group ${isActive ? 'editor-tab--active' : ''}`}
                onMouseDown={(e) => {
                  if (e.button !== 0) return
                  e.stopPropagation()
                  onSelectTab(tabId)
                }}
              >
                <span className="editor-tab-label truncate" title={name}>
                  {name}
                </span>
                <button
                  type="button"
                  className="editor-tab-close"
                  title="关闭标签"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    onCloseTab(tabId)
                  }}
                >
                  <X size={12} strokeWidth={2.25} />
                </button>
              </div>
            )
          })
        )}
      </div>
      <div className="editor-tab-bar-actions flex items-center gap-0.5 px-1 shrink-0 border-l border-white/[0.06]">
        <button
          type="button"
          className="tool-btn p-1 rounded-md"
          title="向右分屏 (Ctrl+Shift+\)"
          onClick={(e) => {
            e.stopPropagation()
            onSplit()
          }}
        >
          <Columns2 size={13} strokeWidth={2.25} />
        </button>
        {paneCount > 1 && (
          <button
            type="button"
            className="tool-btn p-1 rounded-md"
            title="关闭分屏"
            onClick={(e) => {
              e.stopPropagation()
              onClosePane()
            }}
          >
            <X size={13} strokeWidth={2.25} />
          </button>
        )}
      </div>
    </div>
  )
}

/** 预加载标签内容，不切换全局 activeFileId */
export async function prefetchPaneTab(fileId: string): Promise<void> {
  const store = getFileStore()
  if (!('prefetchFile' in store) || typeof store.prefetchFile !== 'function') return
  const node = store.nodes[fileId]
  if (!node || node.type !== 'file' || isPdfFile(node.name)) return
  await store.prefetchFile(fileId)
}
