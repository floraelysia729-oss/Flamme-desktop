import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Pencil } from 'lucide-react'
import { copyMessageText } from './messageCopy'

interface Props {
  content: string
  /** 助手消息为 true，复制时可剥离 Markdown */
  asMarkdown?: boolean
  showEdit?: boolean
  disabled?: boolean
  onEdit?: () => void
}

export default function MessageBubbleActions({
  content,
  asMarkdown = false,
  showEdit = false,
  disabled = false,
  onEdit,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [copied, setCopied] = useState<'md' | 'plain' | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  if (!content.trim() || disabled) return null

  const handleCopy = async (mode: 'md' | 'plain') => {
    try {
      await copyMessageText(content, mode, asMarkdown)
      setCopied(mode)
      setMenuOpen(false)
      window.setTimeout(() => setCopied(null), 1500)
    } catch {
      /* clipboard denied */
    }
  }

  return (
    <div
      ref={rootRef}
      className="message-bubble-actions absolute bottom-1 right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
    >
      <div className="relative">
        <button
          type="button"
          className="message-bubble-action-btn"
          title="复制"
          onClick={() => setMenuOpen((o) => !o)}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
        {menuOpen && (
          <div className="message-copy-menu" role="menu">
            <button type="button" role="menuitem" onClick={() => void handleCopy('md')}>
              复制 Markdown
            </button>
            <button type="button" role="menuitem" onClick={() => void handleCopy('plain')}>
              复制纯文本
            </button>
          </div>
        )}
      </div>
      {showEdit && onEdit && (
        <button
          type="button"
          className="message-bubble-action-btn"
          title="编辑并重新生成"
          onClick={onEdit}
        >
          <Pencil size={12} />
        </button>
      )}
    </div>
  )
}
