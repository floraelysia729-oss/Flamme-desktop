import { useState } from 'react'
import { ChevronDown, ChevronRight, Lock, Unlock, Pencil } from 'lucide-react'
import ChatMarkdown from '../ChatMarkdown'
import type { LearnSectionId } from './types'
import { SECTION_TITLES } from './types'

interface Props {
  id: LearnSectionId
  content: string
  locked: boolean
  defaultOpen?: boolean
  maxHeight?: string
  onContentChange: (content: string) => void
  onToggleLock: () => void
  children?: React.ReactNode
}

export default function SectionBlock({
  id,
  content,
  locked,
  defaultOpen = false,
  maxHeight,
  onContentChange,
  onToggleLock,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(content)

  const title = SECTION_TITLES[id]

  const saveEdit = () => {
    onContentChange(draft)
    setEditing(false)
  }

  return (
    <div className="border-b border-[var(--border)]/30 last:border-b-0">
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button
          type="button"
          className="flex items-center gap-1 flex-1 min-w-0 text-left"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span className="text-xs font-medium truncate">{title}</span>
        </button>
        <button
          type="button"
          className={`p-1 rounded opacity-70 hover:opacity-100 ${locked ? 'text-amber-300' : ''}`}
          title={locked ? '已锁定（AI 不覆盖）' : '锁定此块'}
          onClick={onToggleLock}
        >
          {locked ? <Lock size={12} /> : <Unlock size={12} />}
        </button>
        {!children && (
          <button
            type="button"
            className="p-1 rounded opacity-70 hover:opacity-100"
            title="编辑"
            onClick={() => {
              setDraft(content)
              setEditing((e) => !e)
              setOpen(true)
            }}
          >
            <Pencil size={12} />
          </button>
        )}
      </div>
      {open && (
        <div
          className="px-2 pb-2 overflow-y-auto"
          style={maxHeight ? { maxHeight } : undefined}
        >
          {children ?? (
            editing ? (
              <div className="space-y-1">
                <textarea
                  className="w-full text-[10px] font-mono min-h-[80px] bg-white/5 rounded p-1.5 outline-none text-[var(--ink-on-glass,var(--ink))]"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    className="text-[10px] px-2 py-0.5 rounded border border-[var(--border)]/50"
                    onClick={() => setEditing(false)}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="text-[10px] px-2 py-0.5 rounded bg-[var(--accent)]/25"
                    onClick={saveEdit}
                  >
                    保存
                  </button>
                </div>
              </div>
            ) : (
              <div className="learn-section-md">
                <ChatMarkdown content={content || '（空）'} />
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}
