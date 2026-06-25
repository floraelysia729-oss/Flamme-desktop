import { PanelRightClose, PanelRightOpen } from 'lucide-react'
import { useNotePanelUiStore } from './notePanelUiStore'

export default function NotePanelRailToggle() {
  const open = useNotePanelUiStore((s) => s.open)
  const width = useNotePanelUiStore((s) => s.width)
  const toggleOpen = useNotePanelUiStore((s) => s.toggleOpen)

  return (
    <button
      type="button"
      className="learn-note-rail-btn"
      style={open ? { right: width } : { right: 14 }}
      onClick={toggleOpen}
      title={open ? '收起学习笔记' : '展开学习笔记'}
      aria-label={open ? '收起学习笔记' : '展开学习笔记'}
      aria-pressed={open}
    >
      {open ? (
        <PanelRightClose size={15} strokeWidth={2} />
      ) : (
        <PanelRightOpen size={15} strokeWidth={2} />
      )}
    </button>
  )
}
