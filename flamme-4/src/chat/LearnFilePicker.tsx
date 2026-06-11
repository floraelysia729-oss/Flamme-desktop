import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen } from 'lucide-react'
import { useFileStore } from '../files'
import {
  buildLearnScopeTree,
  collectLearnSourcePaths,
  folderCheckState,
  toggleLearnFileSelection,
  toggleLearnFolderSelection,
  type LearnScopeNode,
} from './learnFiles'

interface Props {
  selected: string[]
  onChange: (paths: string[]) => void
}

function ScopeCheckbox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean
  indeterminate?: boolean
  onChange: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate
  }, [indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="rounded border-[var(--border)] shrink-0"
      onClick={(e) => e.stopPropagation()}
    />
  )
}

function ScopeTreeRow({
  node,
  depth,
  nodes,
  selected,
  onChange,
  expanded,
  onToggleExpand,
}: {
  node: LearnScopeNode
  depth: number
  nodes: Record<string, import('../vfs/types').VFSNode>
  selected: string[]
  onChange: (paths: string[]) => void
  expanded: Set<string>
  onToggleExpand: (id: string) => void
}) {
  const normSelected = useMemo(
    () => new Set(selected.map((p) => p.replace(/\\/g, '/'))),
    [selected],
  )

  if (node.type === 'file') {
    const path = node.id.replace(/\\/g, '/')
    const checked = normSelected.has(path)
    return (
      <li>
        <label
          className="flex items-center gap-1.5 px-1 py-0.5 rounded cursor-pointer hover:bg-[var(--glass-bg)]"
          style={{ paddingLeft: depth * 14 + 4 }}
        >
          <span className="w-[14px] shrink-0" />
          <ScopeCheckbox
            checked={checked}
            onChange={() => onChange(toggleLearnFileSelection(selected, path))}
          />
          <FileText size={12} className="shrink-0 opacity-70" />
          <span className="truncate" title={path}>
            {node.name}
          </span>
        </label>
      </li>
    )
  }

  const isOpen = expanded.has(node.id)
  const fState = folderCheckState(nodes, node.id, selected)
  const folderChecked = fState === 'all'

  return (
    <li>
      <div
        className="flex items-center gap-1 px-1 py-0.5 rounded hover:bg-[var(--glass-bg)]"
        style={{ paddingLeft: depth * 14 + 4 }}
      >
        <button
          type="button"
          className="p-0.5 rounded shrink-0 opacity-70 hover:opacity-100"
          onClick={() => onToggleExpand(node.id)}
          aria-label={isOpen ? '折叠' : '展开'}
        >
          {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <ScopeCheckbox
          checked={folderChecked}
          indeterminate={fState === 'partial'}
          onChange={() => onChange(toggleLearnFolderSelection(nodes, node.id, selected))}
        />
        {isOpen ? (
          <FolderOpen size={12} className="shrink-0 opacity-80 text-[var(--accent)]" />
        ) : (
          <Folder size={12} className="shrink-0 opacity-80" />
        )}
        <button
          type="button"
          className="truncate text-left flex-1 min-w-0"
          title={node.id || node.name}
          onClick={() => onToggleExpand(node.id)}
        >
          {node.name}
        </button>
      </div>
      {isOpen && node.children && node.children.length > 0 && (
        <ul className="space-y-0.5">
          {node.children.map((child) => (
            <ScopeTreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              nodes={nodes}
              selected={selected}
              onChange={onChange}
              expanded={expanded}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

export default function LearnFilePicker({ selected, onChange }: Props) {
  const rootId = useFileStore((s) => s.rootId)
  const nodes = useFileStore((s) => s.nodes)
  const [open, setOpen] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  const tree = useMemo(
    () => (rootId != null ? buildLearnScopeTree(nodes, rootId) : []),
    [nodes, rootId],
  )
  const allPaths = useMemo(
    () => (rootId != null ? collectLearnSourcePaths(nodes, rootId) : []),
    [nodes, rootId],
  )

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (allPaths.length === 0) {
    return (
      <p className="text-xs text-[var(--ink-muted-on-glass,var(--ink-muted))] px-1 py-2 border-b border-[var(--border)]/50">
        学习模式：请先在仪表盘连接 Vault，或确保侧栏已有源文件（.md / .pdf 等）
      </p>
    )
  }

  const scopeHint =
    selected.length === 0
      ? '未选范围 — 检索全库'
      : `已限定 ${selected.length} 个文件`

  return (
    <div className="border-b border-[var(--border)]/50 text-xs">
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button
          type="button"
          className="flex items-center gap-1 flex-1 min-w-0 text-[var(--ink-muted-on-glass,var(--ink-muted))] hover:text-[var(--ink-on-glass,var(--ink))]"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="truncate">学习范围（{scopeHint}）</span>
        </button>
        {open && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--border)]/50 hover:border-[var(--accent)]/40"
              onClick={() => onChange(allPaths)}
              title="选中全部源文件"
            >
              全选
            </button>
            <button
              type="button"
              className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--border)]/50 hover:border-[var(--accent)]/40"
              onClick={() => onChange([])}
              title="清空范围限制"
            >
              清空
            </button>
          </div>
        )}
      </div>
      {open && (
        <ul
          className="max-h-36 overflow-y-auto px-1 pb-2 space-y-0.5"
          style={{ scrollbarGutter: 'stable' }}
        >
          {tree.map((node) => (
            <ScopeTreeRow
              key={node.id}
              node={node}
              depth={0}
              nodes={nodes}
              selected={selected}
              onChange={onChange}
              expanded={expanded}
              onToggleExpand={toggleExpand}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
