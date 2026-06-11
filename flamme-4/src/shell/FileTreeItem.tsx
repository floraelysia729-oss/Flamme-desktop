import { useState, useRef, useEffect } from 'react'
import { ChevronRight, Folder, FolderOpen, File, FileType } from 'lucide-react'
import { isPdfFile } from '../theme/ThemeContext'
import { getFileStore, useFileStore } from '../files'
import { useWorkspaceStore } from '../shared/workspaceStore'

interface FileTreeItemProps {
  nodeId: string
  depth: number
  onContextMenu?: (e: React.MouseEvent, nodeId: string, nodeType: string) => void
  renamingId?: string | null
  onRenameComplete?: () => void
}

/** 系统 wiki 目录 — 侧栏默认折叠，减少占位 */
const COLLAPSED_BY_DEFAULT = new Set(['entities', 'topics'])

function folderInitiallyExpanded(depth: number, name: string): boolean {
  if (COLLAPSED_BY_DEFAULT.has(name.toLowerCase())) return false
  return depth === 0
}

function isAncestorOf(nodes: Record<string, { parentId: string | null }>, folderId: string, fileId: string | null): boolean {
  if (!fileId) return false
  let cur = nodes[fileId]
  while (cur?.parentId != null && cur.parentId !== '') {
    if (cur.parentId === folderId) return true
    cur = nodes[cur.parentId]
  }
  return false
}

export default function FileTreeItem({ nodeId, depth, onContextMenu, renamingId, onRenameComplete }: FileTreeItemProps) {
  const [expanded, setExpanded] = useState(() =>
    folderInitiallyExpanded(depth, getFileStore().nodes[nodeId]?.name ?? ''),
  )
  const [renameValue, setRenameValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const node = useFileStore((s) => s.nodes[nodeId])
  const nodes = useFileStore((s) => s.nodes)
  const activeFileId = useFileStore((s) => s.activeFileId)
  const openFile = useFileStore((s) => s.openFile)
  const renameNode = useFileStore((s) => s.renameNode)

  const isRenaming = renamingId === nodeId
  const containsActive = node?.type === 'folder' && isAncestorOf(nodes, nodeId, activeFileId)

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isRenaming])

  useEffect(() => {
    // entities / topics 始终默认折叠，不因当前打开文件自动展开
    if (containsActive && node && !COLLAPSED_BY_DEFAULT.has(node.name.toLowerCase())) {
      setExpanded(true)
    }
  }, [containsActive, node?.name])

  const isActive = node?.type === 'file' && activeFileId === nodeId

  useEffect(() => {
    if (isActive) {
      rowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [isActive, activeFileId])

  if (!node) return null

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    onContextMenu?.(e, nodeId, node.type)
  }

  const handleRenameSubmit = () => {
    const trimmed = renameValue.trim()
    if (trimmed) {
      void Promise.resolve(renameNode(nodeId, trimmed))
    }
    onRenameComplete?.()
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRenameSubmit()
    } else if (e.key === 'Escape') {
      onRenameComplete?.()
    }
  }

  useEffect(() => {
    if (isRenaming) {
      setRenameValue(node.name)
    }
  }, [isRenaming, node.name])

  const nameElement = isRenaming ? (
    <input
      ref={inputRef}
      className="rename-input bg-transparent border-b border-[var(--ink-muted)] outline-none text-sm flex-1 min-w-0 px-0.5 rounded-none"
      value={renameValue}
      onChange={(e) => setRenameValue(e.target.value)}
      onKeyDown={handleRenameKeyDown}
      onBlur={handleRenameSubmit}
    />
  ) : (
    <span className="truncate">{node.name}</span>
  )

  if (node.type === 'folder') {
    return (
      <div>
        <div
          className={`tree-item flex items-center gap-1.5 py-1.5 px-2 rounded-xl cursor-pointer mx-1 text-[var(--ink)]`}
          style={{ paddingLeft: depth * 16 + 8 }}
          onClick={() => setExpanded(!expanded)}
          onContextMenu={handleContextMenu}
        >
          <ChevronRight
            size={13}
            className={`text-[var(--ink-muted-on-glass,var(--ink-muted))] transition-transform ${expanded ? 'rotate-90' : ''}`}
            strokeWidth={2.25}
            style={{ transitionTimingFunction: 'var(--spring)', transitionDuration: 'var(--duration-fast)' }}
          />
          {expanded ? (
            <FolderOpen size={14} className="text-[var(--accent)] shrink-0" />
          ) : (
            <Folder size={14} className="text-[var(--ink-muted-on-glass,var(--ink-muted))] shrink-0" strokeWidth={2.25} />
          )}
          {nameElement}
        </div>
        {expanded && node.children?.map((childId) => (
          <FileTreeItem
            key={childId}
            nodeId={childId}
            depth={depth + 1}
            onContextMenu={onContextMenu}
            renamingId={renamingId}
            onRenameComplete={onRenameComplete}
          />
        ))}
      </div>
    )
  }

  // File
  return (
    <div
      ref={rowRef}
      className={`tree-item flex items-center gap-1.5 py-1.5 px-2 rounded-xl cursor-pointer mx-1 ${isActive ? 'tree-item-active' : ''}`}
      style={{ paddingLeft: depth * 16 + 8 }}
      onClick={() => {
        void Promise.resolve(openFile(nodeId))
        if (useWorkspaceStore.getState().mode === 'chat') {
          useWorkspaceStore.getState().setMode('read')
        }
      }}
      onContextMenu={handleContextMenu}
    >
      <span className="w-[13px] shrink-0" />
      {isPdfFile(node.name) ? (
        <FileType
          size={14}
          strokeWidth={2.25}
          className={`shrink-0 ${isActive ? 'text-[var(--accent)]' : 'text-[var(--ink-muted-on-glass,var(--ink-muted))]'}`}
        />
      ) : (
        <File
          size={14}
          strokeWidth={2.25}
          className={`shrink-0 ${isActive ? 'text-[var(--accent)]' : 'text-[var(--ink-muted-on-glass,var(--ink-muted))]'}`}
        />
      )}
      {nameElement}
    </div>
  )
}
