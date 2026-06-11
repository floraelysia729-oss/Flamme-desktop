import {
  Plus,
  FolderPlus,
  FolderOpen,
  Palette,
  LayoutDashboard,
  Settings,
} from 'lucide-react'
import { useFileStore, isVaultMode } from '../files'
import { openLocalDocument } from '../api/bridge'
import { useWorkspaceStore } from '../shared/workspaceStore'
import { useTheme } from '../theme/ThemeContext'
import ShellToolbar from './ShellToolbar'
import IngestPanel from './IngestPanel'
import WorkspaceModeToggle from './WorkspaceModeToggle'
import { EDITOR_PREVIEW_BUILD } from '../shared/editorBuildStamp'

interface ToolbarProps {
  onSwitchToDashboard: () => void
  onThemeCycle: () => void
  onOpenSettings: () => void
}

export default function Toolbar({
  onSwitchToDashboard,
  onThemeCycle,
  onOpenSettings,
}: ToolbarProps) {
  const workspaceMode = useWorkspaceStore((s) => s.mode)
  const rootId = useFileStore((s) => s.rootId)
  const createFile = useFileStore((s) => s.createFile)
  const createFolder = useFileStore((s) => s.createFolder)
  const openFile = useFileStore((s) => s.openFile)
  const activeFileId = useFileStore((s) => s.activeFileId)
  const nodes = useFileStore((s) => s.nodes)
  const vaultReady = useFileStore((s) => ('ready' in s ? s.ready : true))
  const { currentThemeName } = useTheme()

  const handleNewFile = () => {
    if (!rootId) return
    void Promise.resolve(createFile(rootId, 'untitled.md', ''))
  }

  const handleNewFolder = () => {
    if (!rootId) return
    void Promise.resolve(createFolder(rootId, '新文件夹'))
  }

  const handleOpen = async () => {
    const result = await openLocalDocument()
    if (!result || !rootId) return
    const id = await Promise.resolve(createFile(rootId, result.name, result.content))
    await Promise.resolve(openFile(id))
  }

  const fileName = activeFileId ? nodes[activeFileId]?.name : null
  const centerLabel =
    workspaceMode === 'chat' && fileName
      ? `对话 · ${fileName}`
      : fileName ?? `主题 · ${currentThemeName}`
  const centerTitle = fileName
    ? `${fileName} · 链接：Ctrl+点击 / 右键 · 构建 ${EDITOR_PREVIEW_BUILD}`
    : `链接：Ctrl+点击 / 右键 · 构建 ${EDITOR_PREVIEW_BUILD}`
  const disabled = isVaultMode() && !vaultReady

  const btn = 'tool-btn p-2 rounded-lg'

  return (
    <ShellToolbar
      left={
        <>
          <button type="button" className={btn} onClick={handleNewFile} title="新建文件" disabled={disabled}>
            <Plus size={16} strokeWidth={2.25} />
          </button>
          <button type="button" className={btn} onClick={handleNewFolder} title="新建文件夹" disabled={disabled}>
            <FolderPlus size={16} strokeWidth={2.25} />
          </button>
          <button type="button" className={btn} onClick={() => void handleOpen()} title="打开文件" disabled={disabled}>
            <FolderOpen size={16} strokeWidth={2.25} />
          </button>
          <WorkspaceModeToggle />
        </>
      }
      center={
        <span title={centerTitle} className="block truncate w-full">
          {centerLabel}
        </span>
      }
      right={
        <>
          <button
            type="button"
            className={btn}
            onClick={onThemeCycle}
            title={`切换壁纸主题：夕岚 → 雾山 → 枝荷（当前：${currentThemeName}，Ctrl+T）`}
          >
            <Palette size={16} strokeWidth={2.25} />
          </button>
          <button
            type="button"
            className={btn}
            onClick={onOpenSettings}
            title="设置：界面 / 编辑器 / API (Ctrl+Shift+T)"
          >
            <Settings size={16} strokeWidth={2.25} />
          </button>
          <IngestPanel variant="icon" disabled={disabled} />
          <button type="button" className={btn} onClick={onSwitchToDashboard} title="Dashboard (Ctrl+D)">
            <LayoutDashboard size={16} strokeWidth={2.25} />
          </button>
        </>
      }
    />
  )
}
