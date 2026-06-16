import { PanelRightClose, PanelRightOpen } from 'lucide-react'
import { useOutlineUiStore } from './outlineUiStore'

interface Props {
  disabled?: boolean
}

export default function OutlineRailToggle({ disabled = false }: Props) {
  const open = useOutlineUiStore((s) => s.open)
  const width = useOutlineUiStore((s) => s.width)
  const toggleOpen = useOutlineUiStore((s) => s.toggleOpen)

  if (disabled) return null

  return (
    <button
      type="button"
      className="doc-outline-rail-btn"
      style={open ? { right: width } : { right: 14 }}
      onClick={toggleOpen}
      title={open ? '收起大纲' : '展开大纲'}
      aria-label={open ? '收起大纲' : '展开大纲'}
      aria-pressed={open}
    >
      {open ? <PanelRightClose size={15} strokeWidth={2} /> : <PanelRightOpen size={15} strokeWidth={2} />}
    </button>
  )
}
