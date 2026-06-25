import { memo, useEffect, useRef, useState } from 'react'
import type { ChatMessage } from './types'
import ChatMarkdown from './ChatMarkdown'
import { useChatScrollStore } from './chatScrollStore'
import MessageBubbleActions from './MessageBubbleActions'
import { extractQuoteFromMessage, formatMessageWithQuote } from '../shared/formatEditorQuote'
import { useEditorQuoteStore } from '../shared/editorQuoteStore'

interface Props {
  messages: ChatMessage[]
  streaming: boolean
  onPickSuggestion: (q: string) => void
  onEditUserMessage: (idx: number, text: string) => void
}

interface MessageItemProps {
  message: ChatMessage
  messageIdx: number
  isStreamingTail: boolean
  streaming: boolean
  editing: boolean
  editDraft: string
  onPickSuggestion: (q: string) => void
  onStartEdit: (idx: number, content: string) => void
  onEditDraftChange: (text: string) => void
  onCancelEdit: () => void
  onSubmitEdit: (idx: number) => void
}

function messageItemPropsEqual(prev: MessageItemProps, next: MessageItemProps): boolean {
  if (prev.messageIdx !== next.messageIdx) return false
  if (prev.editing !== next.editing) return false
  if (prev.editDraft !== next.editDraft) return false
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
  messageIdx,
  isStreamingTail,
  streaming,
  editing,
  editDraft,
  onPickSuggestion,
  onStartEdit,
  onEditDraftChange,
  onCancelEdit,
  onSubmitEdit,
}: MessageItemProps) {
  const isUser = m.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`group relative max-w-[92%] rounded-xl px-3 py-2 pb-7 text-sm leading-relaxed break-words ${
          isUser
            ? 'whitespace-pre-wrap bg-[var(--accent)]/20 text-[var(--ink-on-glass,var(--ink))]'
            : 'bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--ink-on-glass,var(--ink))]'
        }`}
      >
        {isUser ? (
          editing ? (
            <div className="space-y-2 min-w-[200px]">
              <textarea
                className="w-full min-h-[72px] resize-y rounded-lg px-2 py-1.5 text-sm bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--ink-on-glass,var(--ink))] outline-none focus:ring-1 focus:ring-[var(--accent)]/40"
                value={editDraft}
                onChange={(e) => onEditDraftChange(e.target.value)}
                disabled={streaming}
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  className="text-[11px] px-2 py-0.5 rounded border border-[var(--border)]/50"
                  onClick={onCancelEdit}
                  disabled={streaming}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="text-[11px] px-2 py-0.5 rounded bg-[var(--accent)]/25"
                  onClick={() => onSubmitEdit(messageIdx)}
                  disabled={streaming}
                >
                  重新生成
                </button>
              </div>
            </div>
          ) : (
            m.content || null
          )
        ) : m.content ? (
          <ChatMarkdown content={m.content} skipMath={isStreamingTail} />
        ) : isStreamingTail ? (
          <span className="text-[var(--ink-muted-on-glass,var(--ink-muted))]">…</span>
        ) : null}

        {!editing && (
          <MessageBubbleActions
            content={m.content}
            asMarkdown={!isUser}
            showEdit={isUser && !streaming}
            disabled={streaming && isStreamingTail}
            onEdit={
              isUser
                ? () => onStartEdit(messageIdx, m.content)
                : undefined
            }
          />
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

export default function MessageList({
  messages,
  streaming,
  onPickSuggestion,
  onEditUserMessage,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const prevMessagesRef = useRef<ChatMessage[]>([])
  const scrollTarget = useChatScrollStore((s) => s.scrollTarget)
  const clearScrollTarget = useChatScrollStore((s) => s.clearScrollTarget)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState('')

  const scrollToBottom = (behavior: ScrollBehavior = 'auto') => {
    const container = containerRef.current
    if (!container) return
    container.scrollTo({ top: container.scrollHeight, behavior })
  }

  const isNearBottom = (threshold = 80) => {
    const container = containerRef.current
    if (!container) return true
    return container.scrollHeight - container.scrollTop - container.clientHeight < threshold
  }

  useEffect(() => {
    if (streaming) setEditingIdx(null)
  }, [streaming])

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

  useEffect(() => {
    if (scrollTarget === null) return
    const container = containerRef.current
    if (!container) {
      clearScrollTarget()
      return
    }

    const el = container.querySelector<HTMLElement>(
      `[data-message-idx="${scrollTarget}"]`,
    )
    if (!el) {
      clearScrollTarget()
      return
    }

    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('chat-msg-highlight')
    const timer = window.setTimeout(() => {
      el.classList.remove('chat-msg-highlight')
      clearScrollTarget()
    }, 1500)

    return () => {
      window.clearTimeout(timer)
      el.classList.remove('chat-msg-highlight')
    }
  }, [scrollTarget, clearScrollTarget])

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
        <div key={i} data-message-idx={i} className="chat-message-row">
          <MessageItem
            message={m}
            messageIdx={i}
            isStreamingTail={streaming && i === streamingTailIdx && m.role === 'assistant'}
            streaming={streaming}
            editing={editingIdx === i}
            editDraft={editingIdx === i ? editDraft : ''}
            onPickSuggestion={onPickSuggestion}
            onStartEdit={(idx, content) => {
              const { quote, userText } = extractQuoteFromMessage(content)
              if (quote) {
                useEditorQuoteStore.getState().setQuote(quote)
              }
              setEditingIdx(idx)
              setEditDraft(userText)
            }}
            onEditDraftChange={setEditDraft}
            onCancelEdit={() => {
              setEditingIdx(null)
              setEditDraft('')
            }}
            onSubmitEdit={(idx) => {
              const text = editDraft.trim()
              const quote = useEditorQuoteStore.getState().quote
              if (!text && !quote) return
              const payload = formatMessageWithQuote(quote, text)
              setEditingIdx(null)
              setEditDraft('')
              useEditorQuoteStore.getState().clearQuote('edit-submit')
              onEditUserMessage(idx, payload)
            }}
          />
        </div>
      ))}
    </div>
  )
}
