import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  id?: string
}

export default function ApiKeyField({ value, onChange, placeholder, id }: Props) {
  const [show, setShow] = useState(false)

  return (
    <div className="flex gap-1 items-stretch">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        autoComplete="off"
        spellCheck={false}
        className="inner-chip inner-chip-dark flex-1 min-w-0 px-2 py-1.5 text-[11px] text-[var(--ink)] font-mono outline-none focus:ring-1 focus:ring-[var(--accent)]"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onChange(e.target.value.trim())}
      />
      <button
        type="button"
        className="tool-btn px-2 rounded-lg shrink-0"
        onClick={() => setShow((v) => !v)}
        title={show ? '隐藏密钥' : '显示密钥'}
        aria-label={show ? '隐藏密钥' : '显示密钥'}
        aria-pressed={show}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  )
}
