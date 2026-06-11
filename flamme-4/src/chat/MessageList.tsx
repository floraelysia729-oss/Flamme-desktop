import { useEffect, useRef } from 'react'
import type { ChatMessage } from './types'
import ChatMarkdown from './ChatMarkdown'

interface Props {
  messages: ChatMessage[]
  streaming: boolean
  onPickSuggestion: (q: string) => void
}

export default function MessageList({ messages, streaming, onPickSuggestion }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const prevLenRef = useRef(messages.length)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const last = messages[messages.length - 1]
    const userJustSent =
      messages.length > prevLenRef.current && last?.role === 'user'
    prevLenRef.current = messages.length

    if (userJustSent) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' })
      return
    }

    const fits = container.scrollHeight <= container.clientHeight

    if (streaming) {
      if (fits) endRef.current?.scrollIntoView({ behavior: 'auto' })
    } else if (fits) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, streaming])

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 text-center text-sm text-[var(--ink-muted-on-glass,var(--ink-muted))]">
        <div className="max-w-xs space-y-2">
          <p>
            <strong className="text-[var(--ink-on-glass,var(--ink))]">搜索</strong>
            ：知识库问答与维护
          </p>
          <p>
            <strong className="text-[var(--ink-on-glass,var(--ink))]">学习</strong>
            ：简短讲解，可选材料范围
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3"
      style={{ scrollbarGutter: 'stable' }}
    >
      {messages.map((m, i) => (
        <div
          key={i}
          className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-[92%] rounded-xl px-3 py-2 text-sm leading-relaxed break-words ${
              m.role === 'user'
                ? 'whitespace-pre-wrap bg-[var(--accent)]/20 text-[var(--ink-on-glass,var(--ink))]'
                : 'bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--ink-on-glass,var(--ink))]'
            }`}
          >
            {m.role === 'assistant' ? (
              m.content ? (
                <ChatMarkdown content={m.content} />
              ) : streaming && i === messages.length - 1 ? (
                <span className="text-[var(--ink-muted-on-glass,var(--ink-muted))]">…</span>
              ) : null
            ) : (
              m.content || null
            )}

            {m.toolStatus && m.toolStatus.length > 0 && (
              <ul className="mt-2 space-y-1 text-[11px] text-[var(--ink-muted-on-glass,var(--ink-muted))]">
                {m.toolStatus.map((ts, j) => (
                  <li key={`${ts.name}-${j}`}>
                    {ts.label ?? ts.name}
                    {ts.status === 'done' ? ' ✓' : ts.status === 'progress' ? ` … ${ts.message ?? ''}` : ' …'}
                  </li>
                ))}
              </ul>
            )}

            {m.suggestedQuestions && m.suggestedQuestions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {m.suggestedQuestions.map((q) => (
                  <button
                    key={q}
                    type="button"
                    className="text-left text-[11px] px-2 py-1 rounded-md border border-[var(--border)]/60 hover:border-[var(--accent)]/50"
                    onClick={() => onPickSuggestion(q)}
                    disabled={streaming}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  )
}
