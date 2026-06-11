import { Files, PanelLeft } from 'lucide-react'
import { useFileStore } from '../files'
import { useWorkspaceStore } from '../shared/workspaceStore'
import FlammeLogo from './FlammeLogo'

export default function SidebarRail() {
  const toggleSidebar = useWorkspaceStore((s) => s.toggleSidebar)
  const setMode = useWorkspaceStore((s) => s.setMode)
  const activeFileId = useFileStore((s) => s.activeFileId)
  const nodes = useFileStore((s) => s.nodes)
  const openFile = useFileStore((s) => s.openFile)

  const fileName = activeFileId ? nodes[activeFileId]?.name : null

  const handleOpenActiveFile = () => {
    if (!activeFileId) {
      toggleSidebar()
      return
    }
    void Promise.resolve(openFile(activeFileId)).then(() => setMode('read'))
  }

  return (
    <div className="flex flex-col items-center h-full py-3 gap-3">
      <FlammeLogo variant="icon" className="shrink-0" />
      <button
        type="button"
        className="tool-btn p-2 rounded-lg"
        onClick={toggleSidebar}
        title="展开文件树 (Ctrl+B)"
      >
        <PanelLeft size={18} strokeWidth={2.25} />
      </button>
      <button
        type="button"
        className="tool-btn p-2 rounded-lg opacity-80"
        onClick={toggleSidebar}
        title="文件"
      >
        <Files size={18} strokeWidth={2.25} />
      </button>
      {fileName && (
        <button
          type="button"
          className="flex-1 min-h-0 w-full px-1 text-[10px] text-[var(--ink-muted-on-glass,var(--ink-muted))] writing-vertical hover:text-[var(--ink-on-glass,var(--ink))] transition-colors truncate"
          style={{ writingMode: 'vertical-rl' }}
          onClick={handleOpenActiveFile}
          title={`${fileName} — 点击返回阅读`}
        >
          {fileName.replace(/\.md$/i, '')}
        </button>
      )}
    </div>
  )
}
