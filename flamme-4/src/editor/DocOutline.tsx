import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, ListTree } from 'lucide-react'
import type { EditorView } from '@codemirror/view'
import {
  buildOutlineTree,
  resolveOutlinePos,
  scanDocOutline,
  type OutlineNode,
} from '../shared/markdownOutline'
import { navigateToPos } from './anchor-nav'
import {
  OUTLINE_MAX_WIDTH,
  OUTLINE_MIN_WIDTH,
  useOutlineUiStore,
} from './outlineUiStore'

interface Props {
  view: EditorView | null
  filePath: string | null
  content: string
  activeId: string | null
}

function collectBranchKeys(nodes: OutlineNode[], prefix = ''): string[] {
  const keys: string[] = []
  nodes.forEach((node, i) => {
    const key = prefix ? `${prefix}/${i}` : String(i)
    if (node.children.length > 0) {
      keys.push(key)
      keys.push(...collectBranchKeys(node.children, key))
    }
  })
  return keys
}

interface RowProps {
  node: OutlineNode
  nodeKey: string
  depth: number
  filePath: string
  view: EditorView
  doc: string
  activeId: string | null
  collapsed: Set<string>
  onToggle: (key: string) => void
}

function OutlineRow({
  node,
  nodeKey,
  depth,
  filePath,
  view,
  doc,
  activeId,
  collapsed,
  onToggle,
}: RowProps) {
  const hasChildren = node.children.length > 0
  const isOpen = !hasChildren || !collapsed.has(nodeKey)
  const isActive = activeId === node.item.id
  const rowRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (isActive && rowRef.current) {
      rowRef.current.scrollIntoView({ block: 'nearest' })
    }
  }, [isActive])

  const jump = () => {
    const pos = resolveOutlinePos(doc, node.item)
    navigateToPos(view, pos, filePath)
  }

  return (
    <div className="doc-outline-node">
      <div
        className={`doc-outline-row ${isActive ? 'doc-outline-row--active' : ''}`}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="doc-outline-toggle"
            onClick={() => onToggle(nodeKey)}
            aria-label={isOpen ? '折叠' : '展开'}
            aria-expanded={isOpen}
          >
            <ChevronRight size={12} className={isOpen ? 'doc-outline-toggle--open' : ''} />
          </button>
        ) : (
          <span className="doc-outline-toggle-spacer" />
        )}
        <button
          ref={rowRef}
          type="button"
          className="doc-outline-label"
          onClick={jump}
          title={node.item.label}
        >
          {node.item.label}
        </button>
      </div>
      {hasChildren && isOpen && (
        <div className="doc-outline-children">
          {node.children.map((child, i) => (
            <OutlineRow
              key={`${nodeKey}-${i}-${child.item.id}`}
              node={child}
              nodeKey={`${nodeKey}/${i}`}
              depth={depth + 1}
              filePath={filePath}
              view={view}
              doc={doc}
              activeId={activeId}
              collapsed={collapsed}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function DocOutline({ view, filePath, content, activeId }: Props) {
  const width = useOutlineUiStore((s) => s.width)
  const setWidth = useOutlineUiStore((s) => s.setWidth)
  const getCollapsed = useOutlineUiStore((s) => s.getCollapsed)
  const toggleCollapsed = useOutlineUiStore((s) => s.toggleCollapsed)
  const expandAll = useOutlineUiStore((s) => s.expandAll)
  const collapseAll = useOutlineUiStore((s) => s.collapseAll)

  const tree = useMemo(() => buildOutlineTree(scanDocOutline(content)), [content])
  const branchKeys = useMemo(() => collectBranchKeys(tree), [tree])
  const [collapsed, setCollapsedLocal] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    if (!filePath) return
    setCollapsedLocal(getCollapsed(filePath))
  }, [filePath, getCollapsed, tree])

  const onToggle = useCallback(
    (key: string) => {
      if (!filePath) return
      toggleCollapsed(filePath, key)
      setCollapsedLocal(getCollapsed(filePath))
    },
    [filePath, toggleCollapsed, getCollapsed],
  )

  const dragging = useRef(false)

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragging.current = true
      const startX = e.clientX
      const startW = width
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'

      const onMove = (ev: MouseEvent) => {
        if (!dragging.current) return
        const next = Math.round(
          Math.min(OUTLINE_MAX_WIDTH, Math.max(OUTLINE_MIN_WIDTH, startW + (startX - ev.clientX))),
        )
        setWidth(next)
      }

      const onUp = () => {
        dragging.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }

      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [width, setWidth],
  )

  if (!view || !filePath) return null

  return (
    <aside
      className="doc-outline-panel"
      style={{ width, maxWidth: '40vw' }}
      aria-label="文档大纲"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="调整大纲宽度"
        className="doc-outline-resize"
        onMouseDown={onResizeStart}
      />
      <header className="doc-outline-header">
        <ListTree size={14} className="doc-outline-header-icon" />
        <span className="doc-outline-header-title">大纲</span>
        <div className="doc-outline-header-actions">
          <button
            type="button"
            className="doc-outline-action"
            title="全部展开"
            onClick={() => {
              expandAll(filePath)
              setCollapsedLocal(getCollapsed(filePath))
            }}
          >
            <ChevronsUpDown size={13} />
          </button>
          <button
            type="button"
            className="doc-outline-action"
            title="全部折叠"
            onClick={() => {
              collapseAll(filePath, branchKeys)
              setCollapsedLocal(getCollapsed(filePath))
            }}
          >
            <ChevronsDownUp size={13} />
          </button>
        </div>
      </header>
      <div className="doc-outline-scroll">
        {tree.length === 0 ? (
          <p className="doc-outline-empty">本文暂无标题</p>
        ) : (
          tree.map((node, i) => (
            <OutlineRow
              key={`${node.item.id}-${i}`}
              node={node}
              nodeKey={String(i)}
              depth={0}
              filePath={filePath}
              view={view}
              doc={content}
              activeId={activeId}
              collapsed={collapsed}
              onToggle={onToggle}
            />
          ))
        )}
      </div>
    </aside>
  )
}
