import { useMemo, useState } from 'react'
import { ChevronRight, Map } from 'lucide-react'
import {
  analyzeKnowledgeTree,
  isOnCurrentPath,
  pathKey,
  shouldDefaultExpand,
  STATUS_COLORS,
  STATUS_LABELS,
} from './knowledgeTreeParse'
import type { TreeNode, TreeNodeStatus } from './types'

interface TreeRowProps {
  node: TreeNode
  nodePath: string
  depth: number
  currentPathKeys: Set<string>
  nextStepKey: string | null
  expandedOverride: Set<string> | null
  onToggle: () => void
  onCurrentNodeClick?: (label: string) => void
}

function StatusBadge({ status }: { status: TreeNodeStatus | null }) {
  if (!status) return null
  return (
    <span className={`kt-status ${STATUS_COLORS[status]}`} title={STATUS_LABELS[status]}>
      {STATUS_LABELS[status]}
    </span>
  )
}

function TreeRow({
  node,
  nodePath,
  depth,
  currentPathKeys,
  nextStepKey,
  expandedOverride,
  onToggle,
  onCurrentNodeClick,
}: TreeRowProps) {
  const hasChildren = node.children.length > 0
  const defaultOpen = shouldDefaultExpand(nodePath, currentPathKeys, depth)
  const [localOpen, setLocalOpen] = useState<boolean | null>(null)
  const expanded =
    expandedOverride === null
      ? (localOpen ?? defaultOpen)
      : expandedOverride.has(nodePath)

  const onPath = isOnCurrentPath(nodePath, currentPathKeys)
  const isCurrent = node.status === 'current'
  const isNext = nextStepKey === nodePath
  const isBranch = node.status === 'branch'
  const isChapter = depth === 0
  const isOffPath = currentPathKeys.size > 0 && !onPath && !isChapter

  const rowClass = [
    'kt-row',
    isChapter ? 'kt-row--chapter' : depth === 1 ? 'kt-row--entry' : 'kt-row--detail',
    onPath ? 'kt-row--on-path' : '',
    isCurrent ? 'kt-row--current' : '',
    isNext ? 'kt-row--next' : '',
    isBranch || isOffPath ? 'kt-row--muted' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const toggle = () => {
    if (!hasChildren) return
    onToggle()
    setLocalOpen(!(localOpen ?? defaultOpen))
  }

  return (
    <div className={`kt-node ${isChapter ? 'kt-node--chapter' : ''}`}>
      <div className={rowClass}>
        {hasChildren ? (
          <button
            type="button"
            className="kt-toggle"
            onClick={toggle}
            aria-label={expanded ? '折叠' : '展开'}
            aria-expanded={expanded}
          >
            <ChevronRight size={12} className={expanded ? 'kt-toggle--open' : ''} />
          </button>
        ) : (
          <span className="kt-toggle-spacer" />
        )}
        <div className="kt-row-body min-w-0 flex-1">
          <div className="kt-row-head">
            <StatusBadge status={node.status} />
            {isCurrent && onCurrentNodeClick ? (
              <button
                type="button"
                className="kt-label kt-label--clickable"
                title={node.label}
                onClick={() => onCurrentNodeClick(node.label)}
              >
                {node.label}
              </button>
            ) : (
              <span className="kt-label" title={node.label}>
                {node.label}
              </span>
            )}
          </div>
          {isCurrent && onCurrentNodeClick && (
            <span className="kt-quiz-hint">点击测验掌握</span>
          )}
          {isNext && (
            <span className="kt-next-hint">建议下一步</span>
          )}
        </div>
      </div>
      {hasChildren && expanded && (
        <div className={isChapter ? 'kt-children kt-children--chapter' : 'kt-children'}>
          {node.children.map((child, i) => (
            <TreeRow
              key={`${nodePath}-${i}-${child.label}`}
              node={child}
              nodePath={pathKey([...nodePath.split('/').map(Number), i])}
              depth={depth + 1}
              currentPathKeys={currentPathKeys}
              nextStepKey={nextStepKey}
              expandedOverride={expandedOverride}
              onToggle={onToggle}
              onCurrentNodeClick={onCurrentNodeClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface Props {
  content: string
  rootTopic?: string
  onCurrentNodeClick?: (label: string) => void
}

export default function KnowledgeTreeView({ content, rootTopic, onCurrentNodeClick }: Props) {
  const analysis = useMemo(() => analyzeKnowledgeTree(content), [content])
  const [expandAll, setExpandAll] = useState<boolean | null>(null)

  const { roots, stats, currentPath, currentPathKeys, nextStep, nextStepKey } = analysis

  const expandedOverride = useMemo(() => {
    if (expandAll === null) return null
    if (!expandAll) return new Set<string>()
    const all = new Set<string>()
    const walk = (nodes: TreeNode[], keys: number[]) => {
      nodes.forEach((n, i) => {
        const k = pathKey([...keys, i])
        if (n.children.length > 0) all.add(k)
        walk(n.children, [...keys, i])
      })
    }
    walk(roots, [])
    return all
  }, [expandAll, roots])

  const handleToggle = () => {
    setExpandAll(null)
  }

  if (roots.length === 0) {
    return (
      <div className="kt-empty">
        <Map size={16} className="opacity-40" />
        <p>继续提问后，AI 会在这里逐步整理出本次学习地图</p>
      </div>
    )
  }

  const focusLabel =
    currentPath.length > 0 ? currentPath[currentPath.length - 1].label : roots[0]?.label
  const pathBreadcrumb =
    currentPath.length > 1
      ? currentPath
          .slice(1)
          .map((n) => n.label)
          .join(' → ')
      : null

  return (
    <div className="kt-root">
      <div className="kt-overview">
        <div className="kt-overview-head">
          <span className="kt-overview-title">本次学习地图</span>
          <div className="kt-overview-actions">
            <button
              type="button"
              className="kt-action-btn"
              onClick={() => setExpandAll(true)}
            >
              全部展开
            </button>
            <button
              type="button"
              className="kt-action-btn"
              onClick={() => {
                setExpandAll(false)
              }}
            >
              收起
            </button>
          </div>
        </div>
        {rootTopic && <p className="kt-overview-topic">{rootTopic}</p>}
        <p className="kt-overview-stats">
          {stats.total} 个概念
          {stats.learned > 0 && ` · 已掌握 ${stats.learned}`}
          {stats.todo > 0 && ` · 待学 ${stats.todo}`}
        </p>
        {focusLabel && (
          <p className="kt-overview-focus">
            <span className="kt-overview-label">当前</span>
            <span className="kt-overview-value">{focusLabel}</span>
          </p>
        )}
        {pathBreadcrumb && (
          <p className="kt-overview-path" title={pathBreadcrumb}>
            {pathBreadcrumb}
          </p>
        )}
        {nextStep && (
          <p className="kt-overview-next">
            <span className="kt-overview-label">下一步</span>
            <span className="kt-overview-value">{nextStep.label}</span>
          </p>
        )}
        <div className="kt-legend">
          {(Object.keys(STATUS_LABELS) as TreeNodeStatus[]).map((s) => (
            <span key={s} className={`kt-legend-item ${STATUS_COLORS[s]}`}>
              {STATUS_LABELS[s]}
            </span>
          ))}
        </div>
      </div>

      <div className="kt-outline">
        {roots.map((root, i) => (
          <TreeRow
            key={`root-${i}-${root.label}`}
            node={root}
            nodePath={pathKey([i])}
            depth={0}
            currentPathKeys={currentPathKeys}
            nextStepKey={nextStepKey}
            expandedOverride={expandedOverride}
            onToggle={handleToggle}
            onCurrentNodeClick={onCurrentNodeClick}
          />
        ))}
      </div>
    </div>
  )
}
