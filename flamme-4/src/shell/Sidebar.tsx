import { useState, useCallback, useEffect } from 'react'
import { PanelLeftClose, Plus } from 'lucide-react'
import { useFileStore, isVaultMode } from '../files'
import { useWorkspaceStore } from '../shared/workspaceStore'
import FlammeLogo from './FlammeLogo'
import { ingestFileStart, waitIngestTask } from '../api/bridge'
import { canIngest, formatIngestError, isIngestablePath, refreshWikiIndex } from '../shared/ingest'
import { useVaultStore } from '../vault/store'
import FileTreeItem from './FileTreeItem'
import ContextMenu from './ContextMenu'

interface CtxMenuState {
  x: number
  y: number
  nodeId: string
  nodeType: string
}

export default function Sidebar() {
  const toggleSidebar = useWorkspaceStore((s) => s.toggleSidebar)
  const rootId = useFileStore((s) => s.rootId)
  const createFile = useFileStore((s) => s.createFile)
  const createFolder = useFileStore((s) => s.createFolder)
  const deleteNode = useFileStore((s) => s.deleteNode)
  const openFile = useFileStore((s) => s.openFile)
  const nodes = useFileStore((s) => s.nodes)
  const vaultError = useFileStore((s) => s.error ?? null)
  const vaultReady = useFileStore((s) => (isVaultMode() ? s.ready === true : true))

  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [ingestMsg, setIngestMsg] = useState('')
  const [ingesting, setIngesting] = useState(false)
  const [linkMiss, setLinkMiss] = useState('')

  useEffect(() => {
    const onMiss = (e: Event) => {
      const title = (e as CustomEvent<{ title: string }>).detail?.title
      if (title) setLinkMiss(`未找到笔记：${title}`)
    }
    window.addEventListener('flamme:wikilink-miss', onMiss)
    return () => window.removeEventListener('flamme:wikilink-miss', onMiss)
  }, [])

  const handleNewFile = () => {
    void Promise.resolve(createFile(rootId, 'untitled.md', ''))
  }

  const handleContextMenu = useCallback((e: React.MouseEvent, nodeId: string, nodeType: string) => {
    setCtxMenu({ x: e.clientX, y: e.clientY, nodeId, nodeType })
  }, [])

  const handleRename = useCallback(() => {
    if (!ctxMenu) return
    setRenamingId(ctxMenu.nodeId)
  }, [ctxMenu])

  const handleDelete = useCallback(() => {
    if (!ctxMenu) return
    void Promise.resolve(deleteNode(ctxMenu.nodeId))
  }, [ctxMenu, deleteNode])

  const handleNewFileInside = useCallback(() => {
    if (!ctxMenu) return
    void Promise.resolve(createFile(ctxMenu.nodeId, 'untitled.md', '')).then((id) => {
      if (typeof id === 'string') void Promise.resolve(openFile(id))
    })
  }, [ctxMenu, createFile, openFile])

  const handleNewFolderInside = useCallback(() => {
    if (!ctxMenu) return
    void Promise.resolve(createFolder(ctxMenu.nodeId, '新文件夹'))
  }, [ctxMenu, createFolder])

  const handleIngest = useCallback(async () => {
    if (!ctxMenu || ingesting) return
    setIngesting(true)
    setIngestMsg('摄入中…')
    try {
      const start = await ingestFileStart(ctxMenu.nodeId)
      if (start.status === 'error' || !start.task_id) {
        setIngestMsg(formatIngestError(start.error ?? '摄入失败'))
        return
      }
      const res = await waitIngestTask(start.task_id, {
        onProgress: (st) => {
          const running = st.stages?.find((s) => s.status === 'running')
          if (running) {
            setIngestMsg(
              running.detail ? `${running.label} (${running.detail})…` : `${running.label}…`,
            )
          }
        },
      })
      if (res.status === 'error') {
        setIngestMsg(formatIngestError(res.error ?? '摄入失败'))
      } else {
        const name = nodes[ctxMenu.nodeId]?.name ?? ctxMenu.nodeId
        setIngestMsg(`已摄入：${name}，正在更新索引与图谱…`)
        if (isVaultMode()) {
          await useVaultStore.getState().refreshTree()
        }
        try {
          await refreshWikiIndex({ embed: true, graph: true, topics: false })
          setIngestMsg(`已摄入：${name}（索引与图谱已更新）`)
        } catch (e) {
          setIngestMsg(formatIngestError(e))
        }
      }
    } catch (e) {
      setIngestMsg(formatIngestError(e))
    } finally {
      setIngesting(false)
    }
  }, [ctxMenu, ingesting, nodes])

  const ctxNode = ctxMenu ? nodes[ctxMenu.nodeId] : null
  const showIngest =
    ctxMenu?.nodeType === 'file' &&
    ctxNode &&
    isIngestablePath(ctxMenu.nodeId) &&
    canIngest()

  const menuItems = ctxMenu
    ? [
        ...(ctxMenu.nodeType === 'folder'
          ? [
              { label: '新建文件', onClick: handleNewFileInside },
              { label: '新建文件夹', onClick: handleNewFolderInside },
            ]
          : []),
        ...(showIngest
          ? [{ label: ingesting ? '摄入中…' : '摄入知识库', onClick: () => void handleIngest() }]
          : []),
        { label: '重命名', onClick: handleRename },
        { label: '删除', onClick: handleDelete, danger: true },
      ]
    : []

  return (
    <>
      <div className="sidebar-header flex items-center justify-between px-2 py-2 font-medium uppercase tracking-widest text-[var(--ink-on-glass,var(--ink))] border-b border-white/[0.06]">
        <div className="flex items-center gap-1.5 min-w-0">
          <FlammeLogo variant="icon" />
          <span className="truncate">文件</span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            className="tool-btn tool-btn--icon"
            onClick={toggleSidebar}
            title="折叠文件树 (Ctrl+B)"
          >
            <PanelLeftClose size={15} strokeWidth={2.25} />
          </button>
          <button
            type="button"
            className="tool-btn tool-btn--icon"
            onClick={handleNewFile}
            title="新建文件"
            disabled={isVaultMode() && !vaultReady}
          >
            <Plus size={15} strokeWidth={2.25} />
          </button>
        </div>
      </div>
      {isVaultMode() && vaultError && (
        <p className="px-3 py-2 text-[11px] text-[var(--danger)] leading-relaxed">{vaultError}</p>
      )}
      {ingestMsg && (
        <p className="px-3 py-1 text-[10px] text-[var(--ink-muted)] leading-relaxed">{ingestMsg}</p>
      )}
      {linkMiss && (
        <p className="px-3 py-1 text-[10px] text-[var(--danger)] leading-relaxed">{linkMiss}</p>
      )}
      {isVaultMode() && !vaultReady && !vaultError && (
        <p className="px-3 py-2 text-[11px] text-[var(--ink-muted)] leading-relaxed">
          请在 Dashboard 连接面板选择 Vault 文件夹
        </p>
      )}
      <div className="flex-1 overflow-y-auto py-1.5 px-1">
        {(!isVaultMode() || (vaultReady && nodes[rootId])) ? (
          <FileTreeItem
            nodeId={rootId}
            depth={0}
            onContextMenu={handleContextMenu}
            renamingId={renamingId}
            onRenameComplete={() => setRenamingId(null)}
          />
        ) : null}
      </div>
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={menuItems}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </>
  )
}
