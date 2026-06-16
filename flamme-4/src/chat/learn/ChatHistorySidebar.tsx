import { useCallback, useEffect, useState } from 'react'
import { MessageSquarePlus, Trash2 } from 'lucide-react'
import { clearChatSession, listChatSessions } from '../../api/bridge'
import type { ChatMode } from '../types'
import type { ChatSessionSummary } from '../types'

const HISTORY_OPEN_KEY = 'flamme-chat-history-open'

export function loadHistoryOpen(): boolean {
  try {
    const v = localStorage.getItem(HISTORY_OPEN_KEY)
    if (v === 'false') return false
  } catch { /* */ }
  return true
}

export function saveHistoryOpen(open: boolean) {
  try {
    localStorage.setItem(HISTORY_OPEN_KEY, String(open))
  } catch { /* */ }
}

function relTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  if (diff < 60_000) return '刚刚'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`
  return d.toLocaleDateString()
}

interface Props {
  open: boolean
  mode: ChatMode
  currentSessionId: string
  onSelectSession: (id: string) => void
  onNewSession: () => void
  refreshKey?: number
}

export default function ChatHistorySidebar({
  open,
  mode,
  currentSessionId,
  onSelectSession,
  onNewSession,
  refreshKey = 0,
}: Props) {
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([])
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const { sessions: list } = await listChatSessions(mode)
      setSessions(list ?? [])
    } catch {
      setSessions([])
    } finally {
      setLoading(false)
    }
  }, [mode])

  useEffect(() => {
    void reload()
  }, [reload, refreshKey, mode])

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!confirm('删除此对话？')) return
    try {
      await clearChatSession(id)
      if (id === currentSessionId) onNewSession()
      void reload()
    } catch { /* */ }
  }

  if (!open) return null

  return (
    <aside className="shrink-0 w-[200px] flex flex-col min-h-0 border-r border-[var(--border)]/40">
      <div className="shrink-0 px-2 py-2 flex items-center justify-between border-b border-[var(--border)]/30">
        <span className="text-xs font-medium">历史</span>
        <button
          type="button"
          className="p-1 rounded hover:bg-white/10"
          title="新对话"
          onClick={onNewSession}
        >
          <MessageSquarePlus size={14} />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto py-1">
        {loading && (
          <p className="text-[10px] px-2 text-[var(--ink-muted)]">加载中…</p>
        )}
        {!loading && sessions.length === 0 && (
          <p className="text-[10px] px-2 text-[var(--ink-muted)]">暂无会话</p>
        )}
        {sessions.map((s) => {
          const active = s.session_id === currentSessionId
          return (
            <div
              key={s.session_id}
              role="button"
              tabIndex={0}
              className={`w-full text-left px-2 py-2 group flex items-start gap-1 border-l-2 transition-colors cursor-pointer ${
                active
                  ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                  : 'border-transparent hover:bg-white/5'
              }`}
              onClick={() => onSelectSession(s.session_id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelectSession(s.session_id)
                }
              }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs truncate font-medium">{s.title || '新对话'}</p>
                <p className="text-[10px] text-[var(--ink-muted)]">
                  {relTime(s.updated_at)}
                </p>
              </div>
              <button
                type="button"
                className="opacity-0 group-hover:opacity-60 p-0.5 shrink-0"
                onClick={(e) => void handleDelete(e, s.session_id)}
                title="删除"
              >
                <Trash2 size={12} />
              </button>
            </div>
          )
        })}
      </div>
    </aside>
  )
}
