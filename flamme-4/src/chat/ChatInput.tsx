import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { Send, Square } from 'lucide-react'

interface Props {
  streaming: boolean
  onSend: (text: string) => void
  onCancel: () => void
}

export default function ChatInput({ streaming, onSend, onCancel }: Props) {
  const [input, setInput] = useState('')

  const submit = () => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    onSend(text)
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

  return (
    <form
      onSubmit={onSubmit}
      className="shrink-0 p-2 border-t border-[var(--border)]/50 flex gap-2 items-end"
    >
      <textarea
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
          disabled={!input.trim()}
          title="发送"
        >
          <Send size={18} />
        </button>
      )}
    </form>
  )
}
