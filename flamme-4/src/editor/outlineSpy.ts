import type { EditorView } from '@codemirror/view'
import { activeOutlineId, type OutlineItem } from '../shared/markdownOutline'

const THROTTLE_MS = 100

export function docPosAtScrollTop(view: EditorView, scrollTop: number): number {
  const y = scrollTop + 80
  try {
    const block = view.lineBlockAtHeight(y)
    return block.from
  } catch {
    return 0
  }
}

export function spyActiveOutlineId(
  view: EditorView,
  items: OutlineItem[],
): string | null {
  if (items.length === 0) return null
  const pos = docPosAtScrollTop(view, view.scrollDOM.scrollTop)
  return activeOutlineId(items, pos)
}

export function attachOutlineSpy(
  view: EditorView,
  getItems: () => OutlineItem[],
  onActiveId: (id: string | null) => void,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastId: string | null = null

  const emit = () => {
    const id = spyActiveOutlineId(view, getItems())
    if (id !== lastId) {
      lastId = id
      onActiveId(id)
    }
  }

  const onScroll = () => {
    if (timer) return
    timer = setTimeout(() => {
      timer = null
      emit()
    }, THROTTLE_MS)
  }

  view.scrollDOM.addEventListener('scroll', onScroll, { passive: true })
  emit()

  return () => {
    view.scrollDOM.removeEventListener('scroll', onScroll)
    if (timer) clearTimeout(timer)
  }
}
