import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { parseKnowledgeTree, STATUS_COLORS } from './knowledgeTreeParse'
import type { TreeNode } from './types'

function TreeRow({ node, depth }: { node: TreeNode; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 2)
  const hasChildren = node.children.length > 0
  const statusClass = node.status ? STATUS_COLORS[node.status] : 'bg-gray-400'

  return (
    <div className="min-w-0">
      <div
        className="flex items-center gap-1 py-0.5 rounded hover:bg-white/5 pr-1"
        style={{ paddingLeft: depth * 12 }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="p-0.5 shrink-0 opacity-70 hover:opacity-100"
            onClick={() => setExpanded((e) => !e)}
            aria-label={expanded ? '折叠' : '展开'}
          >
            <ChevronRight
              size={12}
              className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
            />
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${statusClass}`}
          title={node.status ?? undefined}
        />
        <span className="text-xs truncate text-[var(--ink-on-glass,var(--ink))]">
          {node.label}
        </span>
      </div>
      {hasChildren && expanded && (
        <div>
          {node.children.map((child, i) => (
            <TreeRow key={`${depth}-${i}-${child.label}`} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

interface Props {
  content: string
}

export default function KnowledgeTreeView({ content }: Props) {
  const roots = parseKnowledgeTree(content)
  if (roots.length === 0) {
    return (
      <p className="text-[10px] text-[var(--ink-muted-on-glass,var(--ink-muted))] px-1 py-2">
        对话后将在此生成知识树
      </p>
    )
  }
  return (
    <div className="py-1">
      {roots.map((root, i) => (
        <TreeRow key={`root-${i}-${root.label}`} node={root} depth={0} />
      ))}
    </div>
  )
}
