import { createPortal } from 'react-dom'

interface Props {
  themeLabel: string
  onApplyDefaults: () => void
  onKeepCurrent: () => void
  /** 不再弹窗，以后换主题自动应用各主题默认编辑器配色 */
  onDontAskAgain: () => void
}

export default function EditorThemeConfirm({
  themeLabel,
  onApplyDefaults,
  onKeepCurrent,
  onDontAskAgain,
}: Props) {
  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-[600] bg-black/45 cursor-default"
        aria-label="关闭"
        onClick={onKeepCurrent}
      />
      <div
        className="fixed left-1/2 top-1/2 z-[601] w-[min(92vw,22rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/15 bg-[var(--bg-surface)] p-4 shadow-2xl"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="editor-theme-confirm-title"
      >
        <p
          id="editor-theme-confirm-title"
          className="text-sm font-medium text-[var(--ink)] leading-relaxed"
        >
          已自定义编辑器配色。是否更换为「{themeLabel}」的默认编辑器配色？
        </p>
        <p className="mt-2 text-xs text-[var(--ink-muted)] leading-relaxed">
          选择「保留」只切换壁纸/明暗，语法颜色不变。换主题后想恢复各主题默认色，请点「使用默认配色」。
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-[var(--accent)]/25 text-[var(--ink)] ring-1 ring-[var(--accent)]/40 hover:bg-[var(--accent)]/35"
              onClick={onApplyDefaults}
            >
              使用默认配色
            </button>
            <button
              type="button"
              className="flex-1 py-2.5 rounded-xl text-xs font-medium border border-white/15 text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-white/5"
              onClick={onKeepCurrent}
            >
              保留当前配色
            </button>
          </div>
          <button
            type="button"
            className="w-full py-2 rounded-xl text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-white/5"
            onClick={onDontAskAgain}
          >
            不再提醒
          </button>
          <p className="text-[10px] text-[var(--ink-muted)] text-center leading-relaxed">
            「不再提醒」后，换主题将自动使用各主题默认编辑器配色，不再弹出此窗口。
          </p>
        </div>
      </div>
    </>,
    document.body,
  )
}
