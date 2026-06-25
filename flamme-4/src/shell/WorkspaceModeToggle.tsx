import { BookOpen, Columns2, MessageCircle } from 'lucide-react'
import { useWorkspaceStore, type WorkspaceMode } from '../shared/workspaceStore'

const MODES: { id: WorkspaceMode; icon: typeof BookOpen; label: string; title: string }[] = [
  { id: 'read', icon: BookOpen, label: '阅读', title: '阅读模式 — 编辑器全宽' },
  { id: 'split', icon: Columns2, label: '分屏', title: '分屏模式 — 编辑器 + AI 对话' },
  { id: 'chat', icon: MessageCircle, label: '对话', title: '对话模式 — AI 对话全宽' },
]

export default function WorkspaceModeToggle() {
  const mode = useWorkspaceStore((s) => s.mode)
  const setMode = useWorkspaceStore((s) => s.setMode)

  return (
    <div
      className="flex items-center rounded-lg border border-white/[0.08] overflow-hidden ml-0.5 shrink-0"
      role="group"
      aria-label="工作区布局"
    >
      {MODES.map(({ id, icon: Icon, label, title }) => {
        const active = mode === id
        return (
          <button
            key={id}
            type="button"
            className={`flex items-center justify-center gap-1 px-1.5 py-1 text-[10px] transition-colors ${
              active
                ? 'bg-[var(--accent)]/20 text-[var(--ink-on-glass,var(--ink))] ring-1 ring-inset ring-[var(--accent)]/40'
                : 'text-[var(--ink-muted-on-glass,var(--ink-muted))] hover:bg-white/[0.06]'
            }`}
            onClick={() => setMode(id)}
            title={title}
            aria-pressed={active}
          >
            <Icon size={14} strokeWidth={2.25} />
            <span className="hidden sm:inline">{label}</span>
          </button>
        )
      })}
    </div>
  )
}
