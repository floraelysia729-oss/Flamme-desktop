import { FolderOpen, X } from 'lucide-react'
import { useTheme } from '../theme/ThemeContext'
import { pickVaultFolder } from '../api/bridge'
import { useConnectionStore } from '../api/connection'
import { isVaultMode } from '../files'
import { useVaultStore } from '../vault/store'
import FlammeLogo from './FlammeLogo'

interface Props {
  open: boolean
  onClose: () => void
}

/** 首次启动：引导选择 Vault，之后可跳过 */
export default function WelcomeVaultDialog({ open, onClose }: Props) {
  const { glass } = useTheme()
  const setVaultPath = useConnectionStore((s) => s.setVaultPath)

  if (!open) return null

  const handlePick = async () => {
    const path = await pickVaultFolder()
    if (!path) return
    setVaultPath(path)
    if (isVaultMode()) {
      await useVaultStore.getState().initFromVaultPath(path)
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
      <div
        className={`${glass.card} relative w-full max-w-md rounded-2xl p-6 shadow-xl flex flex-col items-center gap-5`}
        role="dialog"
        aria-labelledby="welcome-title"
      >
        <button
          type="button"
          className="absolute top-3 right-3 tool-btn p-1.5 rounded-lg"
          onClick={onClose}
          title="稍后设置"
        >
          <X size={16} />
        </button>
        <FlammeLogo variant="full" size="hero" className="py-2" />
        <div className="text-center space-y-2">
          <h2 id="welcome-title" className="text-lg font-medium text-[var(--ink-on-glass,var(--ink))]">
            欢迎使用 FLAMME
          </h2>
          <p className="text-sm text-[var(--ink-muted-on-glass,var(--ink-muted))] leading-relaxed">
            选择你的 Obsidian / Markdown 笔记文件夹，即可开始阅读、AI 对话与学习模式。AI 引擎已在本地运行，无需手动启动后端。
          </p>
        </div>
        <div className="flex flex-col w-full gap-2">
          <button
            type="button"
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
            onClick={() => void handlePick()}
          >
            <FolderOpen size={18} />
            选择笔记库文件夹
          </button>
          <button
            type="button"
            className="w-full py-2 text-sm text-[var(--ink-muted-on-glass,var(--ink-muted))] hover:text-[var(--ink-on-glass,var(--ink))]"
            onClick={onClose}
          >
            稍后设置
          </button>
        </div>
      </div>
    </div>
  )
}
