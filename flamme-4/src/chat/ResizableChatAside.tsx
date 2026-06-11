import { useCallback, useRef, type ReactNode } from 'react'
import { useTheme } from '../theme/ThemeContext'

const STORAGE_KEY = 'flamme-chat-width'
const DEFAULT_WIDTH = 420
const MIN_WIDTH = 260
const MAX_WIDTH = 1200

export function loadChatPanelWidth(): number {
  try {
    const n = Number(localStorage.getItem(STORAGE_KEY))
    if (Number.isFinite(n) && n >= MIN_WIDTH && n <= MAX_WIDTH) return n
  } catch {
    /* ignore */
  }
  return DEFAULT_WIDTH
}

export function saveChatPanelWidth(px: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(px))
  } catch {
    /* ignore */
  }
}

interface Props {
  width: number
  onWidthChange: (w: number) => void
  children: ReactNode
}

export default function ResizableChatAside({ width, onWidthChange, children }: Props) {
  const { glass } = useTheme()
  const dragging = useRef(false)
  const latestWidth = useRef(width)

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragging.current = true
      const startX = e.clientX
      const startW = width
      latestWidth.current = width
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'

      const onMove = (ev: MouseEvent) => {
        if (!dragging.current) return
        const next = Math.round(
          Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startW + (startX - ev.clientX))),
        )
        latestWidth.current = next
        onWidthChange(next)
      }

      const onUp = () => {
        dragging.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        saveChatPanelWidth(latestWidth.current)
      }

      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [width, onWidthChange],
  )

  return (
    <aside
      className={`relative shrink-0 flex flex-col min-h-0 min-w-0 ${glass.card} overflow-hidden rounded-xl`}
      style={{ width, maxWidth: '55vw' }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="调整对话面板宽度"
        title="拖动调整宽度"
        className="absolute left-0 top-0 bottom-0 z-10 w-2 -ml-1 cursor-col-resize hover:bg-[var(--accent)]/25 active:bg-[var(--accent)]/40 transition-colors"
        onMouseDown={onResizeStart}
      />
      <div className="flex flex-col flex-1 min-h-0 min-w-0">{children}</div>
    </aside>
  )
}
