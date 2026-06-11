import { useCallback, useRef, useState } from 'react'
import { BookOpen } from 'lucide-react'
import KnowledgeTreeView from './KnowledgeTreeView'
import SectionBlock from './SectionBlock'
import { toggleSectionLock, updateSection } from './noteEdit'
import type { EvidenceItem, LearnNote } from './types'

const NOTE_WIDTH_KEY = 'flamme-learn-note-width'
const DEFAULT_W = 320
const MIN_W = 220
const MAX_W = 480

function loadWidth() {
  try {
    const n = Number(localStorage.getItem(NOTE_WIDTH_KEY))
    if (Number.isFinite(n) && n >= MIN_W && n <= MAX_W) return n
  } catch { /* */ }
  return DEFAULT_W
}

interface Props {
  note: LearnNote
  evidencePack: EvidenceItem[]
  onNoteChange: (note: LearnNote, fromUser?: boolean) => void
  contextPressure: 'warn' | 'critical' | null
  driftToast?: string | null
}

export default function NotePanel({
  note,
  evidencePack,
  onNoteChange,
  contextPressure,
  driftToast,
}: Props) {
  const [width, setWidth] = useState(loadWidth)
  const dragging = useRef(false)

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragging.current = true
      const startX = e.clientX
      const startW = width
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      const onMove = (ev: MouseEvent) => {
        if (!dragging.current) return
        const next = Math.round(Math.min(MAX_W, Math.max(MIN_W, startW + (startX - ev.clientX))))
        setWidth(next)
      }
      const onUp = () => {
        dragging.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        try {
          localStorage.setItem(NOTE_WIDTH_KEY, String(width))
        } catch { /* */ }
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [width],
  )

  /** 仅正文编辑算用户改动；锁定由后端按块跳过，不应阻断全局 AI 合并 */
  const handleContentEdit = (n: LearnNote) => onNoteChange(n, true)
  const handleLockToggle = (n: LearnNote) => onNoteChange(n, false)
  const sec = (id: LearnNote['sections'][0]['id']) =>
    note.sections.find((s) => s.id === id)!

  return (
    <aside
      className="mind-panel relative shrink-0 flex flex-col min-h-0 border-l border-[var(--border)]/40"
      style={{ width }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        className="absolute left-0 top-0 bottom-0 z-10 w-1.5 -ml-0.5 cursor-col-resize hover:bg-[var(--accent)]/25"
        onMouseDown={onResizeStart}
      />
      <header className="shrink-0 px-2 py-2 border-b border-[var(--border)]/30 flex items-center gap-1.5">
        <BookOpen size={14} className="opacity-70" />
        <span className="text-xs font-medium flex-1 truncate">{note.rootTopic}</span>
        {contextPressure && (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded ${
              contextPressure === 'critical'
                ? 'bg-[var(--danger)]/20 text-[var(--danger)]'
                : 'bg-amber-500/20 text-amber-200'
            }`}
          >
            上下文
          </span>
        )}
      </header>

      {driftToast && (
        <p className="shrink-0 text-[10px] px-2 py-1 bg-violet-500/15 text-violet-200">
          {driftToast}
        </p>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        <SectionBlock
          id="knowledge_tree"
          content={sec('knowledge_tree').content}
          locked={sec('knowledge_tree').locked}
          defaultOpen
          onContentChange={(c) => handleContentEdit(updateSection(note, 'knowledge_tree', c))}
          onToggleLock={() => handleLockToggle(toggleSectionLock(note, 'knowledge_tree'))}
        >
          <KnowledgeTreeView content={sec('knowledge_tree').content} />
        </SectionBlock>

        <SectionBlock
          id="qa_summaries"
          content={sec('qa_summaries').content}
          locked={sec('qa_summaries').locked}
          defaultOpen
          maxHeight="200px"
          onContentChange={(c) => handleContentEdit(updateSection(note, 'qa_summaries', c))}
          onToggleLock={() => handleLockToggle(toggleSectionLock(note, 'qa_summaries'))}
        />

        <SectionBlock
          id="types_and_conclusions"
          content={sec('types_and_conclusions').content}
          locked={sec('types_and_conclusions').locked}
          onContentChange={(c) => handleContentEdit(updateSection(note, 'types_and_conclusions', c))}
          onToggleLock={() => handleLockToggle(toggleSectionLock(note, 'types_and_conclusions'))}
        />

        <SectionBlock
          id="learning_progress"
          content={sec('learning_progress').content}
          locked={sec('learning_progress').locked}
          onContentChange={(c) => handleContentEdit(updateSection(note, 'learning_progress', c))}
          onToggleLock={() => handleLockToggle(toggleSectionLock(note, 'learning_progress'))}
        />
      </div>

      {evidencePack.length > 0 && (
        <div className="shrink-0 px-2 py-1.5 border-t border-[var(--border)]/30 max-h-20 overflow-y-auto">
          <p className="text-[10px] text-[var(--ink-muted)] mb-1">引用源</p>
          {evidencePack.slice(0, 3).map((e) => (
            <p key={e.path} className="text-[10px] truncate opacity-80" title={e.path}>
              {e.title || e.path}
            </p>
          ))}
        </div>
      )}
    </aside>
  )
}
