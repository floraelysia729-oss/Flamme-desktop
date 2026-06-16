import { memo, useEffect, useRef } from 'react'
import type { ChatMessage } from './types'
import ChatMarkdown from './ChatMarkdown'

interface Props {
  messages: ChatMessage[]
  streaming: boolean
  onPickSuggestion: (q: string) => void
}

interface MessageItemProps {
  message: ChatMessage
  isStreamingTail: boolean
  streaming: boolean
  onPickSuggestion: (q: string) => void
}

function messageItemPropsEqual(prev: MessageItemProps, next: MessageItemProps): boolean {
  if (prev.isStreamingTail !== next.isStreamingTail) return false
  if (prev.streaming !== next.streaming) return false
  if (prev.message.role !== next.message.role) return false
  if (prev.message.content !== next.message.content) return false
  if (prev.message.toolStatus !== next.message.toolStatus) return false
  if (prev.message.suggestedQuestions !== next.message.suggestedQuestions) return false
  return true
}

const MessageItem = memo(function MessageItem({
  message: m,
  isStreamingTail,
  streaming,
  onPickSuggestion,
}: MessageItemProps) {
  return (
    <div className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[92%] rounded-xl px-3 py-2 text-sm leading-relaxed break-words ${
          m.role === 'user'
            ? 'whitespace-pre-wrap bg-[var(--accent)]/20 text-[var(--ink-on-glass,var(--ink))]'
            : 'bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--ink-on-glass,var(--ink))]'
        }`}
      >
        {m.role === 'assistant' ? (
          m.content ? (
            <ChatMarkdown content={m.content} skipMath={isStreamingTail} />
          ) : isStreamingTail ? (
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
                {ts.status === 'done'
                  ? ' ✓'
                  : ts.status === 'progress'
                    ? ` … ${ts.message ?? ''}`
                    : ' …'}
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
  )
}, messageItemPropsEqual)

export default function MessageList({ messages, streaming, onPickSuggestion }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const prevMessagesRef = useRef<ChatMessage[]>([])

  const scrollToBottom = (behavior: ScrollBehavior = 'auto') => {
    const container = containerRef.current
    if (!container) return
    if (behavior === 'smooth') {
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    } else {
      container.scrollTop = container.scrollHeight
    }
  }

  const isNearBottom = (threshold = 80) => {
    const container = containerRef.current
    if (!container) return true
    return container.scrollHeight - container.scrollTop - container.clientHeight < threshold
  }

  useEffect(() => {
    const prev = prevMessagesRef.current
    const addedUser =
      messages.length > prev.length &&
      messages.slice(prev.length).some((m) => m.role === 'user')
    prevMessagesRef.current = messages

    if (addedUser) {
      scrollToBottom('smooth')
      return
    }

    if (streaming && isNearBottom()) {
      scrollToBottom('auto')
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

  const streamingTailIdx = streaming ? messages.length - 1 : -1

  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3"
      style={{ scrollbarGutter: 'stable' }}
    >
      {messages.map((m, i) => (
        <MessageItem
          key={i}
          message={m}
          isStreamingTail={streaming && i === streamingTailIdx && m.role === 'assistant'}
          streaming={streaming}
          onPickSuggestion={onPickSuggestion}
        />
      ))}
      <div ref={endRef} />
    </div>
  )
}
