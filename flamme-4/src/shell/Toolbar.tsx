import { Palette, LayoutDashboard, Settings, Columns2 } from 'lucide-react'
import { useFileStore, isVaultMode } from '../files'
import { useEditorSplitStore } from '../editor/editorSplitStore'
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
  const activeFileId = useFileStore((s) => s.activeFileId)
  const nodes = useFileStore((s) => s.nodes)
  const vaultReady = useFileStore((s) => ('ready' in s ? s.ready : true))
  const { currentThemeName } = useTheme()

  const fileName = activeFileId ? nodes[activeFileId]?.name : null
  const centerLabel =
    workspaceMode === 'chat' && fileName
      ? `对话 · ${fileName}`
      : fileName ?? `主题 · ${currentThemeName}`
  const centerTitle = fileName
    ? `${fileName} · 链接：Ctrl+点击 / 右键 · 分屏：Ctrl+点击侧栏 / 中键 / Ctrl+Shift+\\ · 构建 ${EDITOR_PREVIEW_BUILD}`
    : `链接：Ctrl+点击 / 右键 · 分屏：Ctrl+点击侧栏 / 中键 · 构建 ${EDITOR_PREVIEW_BUILD}`
  const disabled = isVaultMode() && !vaultReady

  const btn = 'tool-btn tool-btn--icon'

  return (
    <ShellToolbar
      left={
        <>
          <button
            type="button"
            className={btn}
            onClick={() => useEditorSplitStore.getState().splitRight()}
            title="向右分屏 (Ctrl+Shift+\)"
            disabled={disabled || !activeFileId}
          >
            <Columns2 size={16} strokeWidth={2.25} />
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
