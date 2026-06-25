import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Send, Square, X } from 'lucide-react'
import { useEditorQuoteStore } from '../shared/editorQuoteStore'
import { formatMessageWithQuote } from '../shared/formatEditorQuote'

interface Props {
  streaming: boolean
  onSend: (text: string) => void
  onCancel: () => void
}

export default function ChatInput({ streaming, onSend, onCancel }: Props) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const quote = useEditorQuoteStore((s) => s.quote)
  const clearQuote = useEditorQuoteStore((s) => s.clearQuote)

  useEffect(() => {
    const onFocus = () => {
      requestAnimationFrame(() => textareaRef.current?.focus())
    }
    window.addEventListener('flamme:focus-chat-input', onFocus)
    return () => window.removeEventListener('flamme:focus-chat-input', onFocus)
  }, [])

  const submit = () => {
    const text = input.trim()
    if (streaming) return
    if (!text && !quote) return

    const payload = formatMessageWithQuote(quote, text)
    setInput('')
    clearQuote('send')
    onSend(payload)
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    submit()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const lineLabel =
    quote &&
    (quote.lineFrom === quote.lineTo
      ? `L${quote.lineFrom}`
      : `L${quote.lineFrom}–${quote.lineTo}`)

  const canSend = !streaming && (input.trim().length > 0 || !!quote)

  return (
    <form
      onSubmit={onSubmit}
      className="shrink-0 p-2 border-t border-[var(--border)]/50 flex flex-col gap-2"
    >
      {quote && (
        <div className="chat-quote-chip flex items-start gap-2 rounded-lg px-2.5 py-2 text-xs">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-[var(--ink-muted-on-glass,var(--ink-muted))] mb-0.5">
              <span className="font-medium text-[var(--accent)]">{quote.fileName}</span>
              {lineLabel && <span>{lineLabel}</span>}
            </div>
            <p className="line-clamp-2 whitespace-pre-wrap break-words text-[var(--ink-on-glass,var(--ink))]">
              {quote.text}
            </p>
          </div>
          <button
            type="button"
            className="tool-btn p-1 rounded-md shrink-0"
            onClick={() => clearQuote('user-dismiss')}
            title="移除引用"
            disabled={streaming}
          >
            <X size={14} />
          </button>
        </div>
      )}
      <div className="flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder={streaming ? '正在回复…' : '输入消息（Enter 发送）'}
          disabled={streaming}
          className="flex-1 resize-none rounded-lg px-3 py-2 text-sm bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--ink-on-glass,var(--ink))] placeholder:text-[var(--ink-muted-on-glass,var(--ink-muted))] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/40"
        />
        {streaming ? (
          <button
            type="button"
            className="tool-btn p-2 rounded-lg shrink-0"
            onClick={onCancel}
            title="停止"
          >
            <Square size={18} />
          </button>
        ) : (
          <button
            type="submit"
            className="tool-btn p-2 rounded-lg shrink-0 disabled:opacity-40"
            disabled={!canSend}
            title="发送"
          >
            <Send size={18} />
          </button>
        )}
      </div>
    </form>
  )
}
