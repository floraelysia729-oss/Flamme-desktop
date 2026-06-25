import { PanelRightClose, PanelRightOpen } from 'lucide-react'
import { useOutlineUiStore } from './outlineUiStore'
import { useEditorSplitStore } from './editorSplitStore'

interface Props {
  paneId: string
  disabled?: boolean
}

export default function PaneOutlineRailToggle({ paneId, disabled = false }: Props) {
  const open = useEditorSplitStore((s) => s.paneUi[paneId]?.outlineOpen ?? false)
  const togglePaneOutline = useEditorSplitStore((s) => s.togglePaneOutline)
  const width = useOutlineUiStore((s) => s.width)

  if (disabled) return null

  return (
    <button
      type="button"
      className="doc-outline-rail-btn"
      style={open ? { right: width } : { right: 14 }}
      onClick={(e) => {
        e.stopPropagation()
        togglePaneOutline(paneId)
      }}
      title={open ? '收起大纲' : '展开大纲'}
      aria-label={open ? '收起大纲' : '展开大纲'}
      aria-pressed={open}
    >
      {open ? <PanelRightClose size={15} strokeWidth={2} /> : <PanelRightOpen size={15} strokeWidth={2} />}
    </button>
  )
}
