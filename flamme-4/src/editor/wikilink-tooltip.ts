/**
 * Wikilink 悬浮提示（document 捕获 + 坐标回退，兼容 Widget / 源码态）
 */
import { EditorView, ViewPlugin } from '@codemirror/view'
import { getFileStore } from '../files'
import { parseWikilinkTarget, resolveVaultLink } from '../chat/resolveVaultLink'
import { wikilinkAt } from './wikilink-ranges'

function tooltipText(title: string): string {
  const path = resolveVaultLink(title, getFileStore().nodes)
  if (path) return `Ctrl+点击 / 右键打开\n${title}\n${path}`
  return `侧栏未找到该笔记\n${title}\nCtrl+点击 / 右键重试`
}

export const wikilinkHoverPlugin = ViewPlugin.fromClass(
  class {
    tooltip: HTMLDivElement
    activeKey = ''
    private onMove: (e: MouseEvent) => void

    constructor(public view: EditorView) {
      this.tooltip = document.createElement('div')
      this.tooltip.className = 'cm-wikilink-tooltip'
      this.tooltip.setAttribute('role', 'tooltip')
      document.body.appendChild(this.tooltip)

      this.onMove = (e: MouseEvent) => {
        if (!view.dom.isConnected) return

        const target = e.target as Node
        const inEditor =
          view.dom.contains(target) ||
          (target instanceof Node && target.parentNode && view.dom.contains(target.parentNode))

        if (!inEditor) {
          this.hide()
          return
        }

        let title: string | null = null
        let anchor: DOMRect | null = null

        const el = (e.target as HTMLElement).closest?.('.cm-wikilink')
        if (el) {
          const raw = el.getAttribute('data-wikilink')
          if (raw) title = parseWikilinkTarget(raw)
          anchor = el.getBoundingClientRect()
        }

        if (!title) {
          try {
            const pos = view.posAtCoords({ x: e.clientX, y: e.clientY })
            if (pos != null) {
              const hit = wikilinkAt(view.state.doc.toString(), pos)
              if (hit) {
                title = hit.title
                const coords = view.coordsAtPos(hit.from)
                if (coords) {
                  anchor = new DOMRect(
                    coords.left,
                    coords.top,
                    coords.right - coords.left,
                    coords.bottom - coords.top,
                  )
                }
              }
            }
          } catch {
            this.hide()
            return
          }
        }

        if (!title) {
          this.hide()
          return
        }

        const key = title
        if (key !== this.activeKey) {
          this.activeKey = key
          this.tooltip.textContent = tooltipText(title)
        }

        if (anchor) {
          this.placeRect(anchor)
        } else {
          this.placeAt(e.clientX, e.clientY)
        }
      }

      document.addEventListener('mousemove', this.onMove, true)
      view.dom.addEventListener('mouseleave', () => this.hide())
    }

    placeRect(r: DOMRect) {
      this.tooltip.style.display = 'block'
      this.tooltip.style.left = '-9999px'
      this.tooltip.style.top = '0'
      const tw = this.tooltip.offsetWidth
      const th = this.tooltip.offsetHeight
      let left = r.left + r.width / 2 - tw / 2
      let top = r.bottom + 8
      const pad = 8
      left = Math.max(pad, Math.min(left, window.innerWidth - tw - pad))
      if (top + th > window.innerHeight - pad) top = r.top - th - 8
      this.tooltip.style.left = `${left}px`
      this.tooltip.style.top = `${top}px`
    }

    placeAt(x: number, y: number) {
      this.tooltip.style.display = 'block'
      this.tooltip.style.left = `${x + 12}px`
      this.tooltip.style.top = `${y + 12}px`
    }

    hide() {
      this.tooltip.style.display = 'none'
      this.activeKey = ''
    }

    destroy() {
      document.removeEventListener('mousemove', this.onMove, true)
      this.tooltip.remove()
    }
  },
)
