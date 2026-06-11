import type { ChatMode } from './types'

interface Props {
  mode: ChatMode
  onChange: (mode: ChatMode) => void
  disabled?: boolean
}

const HINT: Record<ChatMode, string> = {
  search: '知识库助手：检索、维护 wiki，完整执行多步任务',
  learn: '学习模式：简短教学回答，可限定学习材料并生成追问',
}

export default function ModeToggle({ mode, onChange, disabled }: Props) {
  return (
    <div
      className="flex items-center gap-2 shrink-0"
      title={HINT[mode]}
    >
      <button
        type="button"
        disabled={disabled}
        className={`text-[11px] font-medium tracking-wide px-2 py-1 rounded-md transition-colors ${
          mode === 'search'
            ? 'bg-[var(--accent)]/25 text-[var(--ink-on-glass,var(--ink))]'
            : 'text-[var(--ink-muted-on-glass,var(--ink-muted))] hover:text-[var(--ink-on-glass,var(--ink))]'
        }`}
        onClick={() => onChange('search')}
      >
        搜索
      </button>
      <button
        type="button"
        role="switch"
        aria-checked={mode === 'learn'}
        disabled={disabled}
        className="relative w-9 h-5 rounded-full bg-[var(--border)]/80 transition-colors"
        onClick={() => onChange(mode === 'search' ? 'learn' : 'search')}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-[var(--ink-on-glass,var(--ink))] shadow transition-transform ${
            mode === 'learn' ? 'translate-x-4' : ''
          }`}
        />
      </button>
      <button
        type="button"
        disabled={disabled}
        className={`text-[11px] font-medium tracking-wide px-2 py-1 rounded-md transition-colors ${
          mode === 'learn'
            ? 'bg-[var(--accent-warm)]/30 text-[var(--ink-on-glass,var(--ink))]'
            : 'text-[var(--ink-muted-on-glass,var(--ink-muted))] hover:text-[var(--ink-on-glass,var(--ink))]'
        }`}
        onClick={() => onChange('learn')}
      >
        学习
      </button>
    </div>
  )
}
