/** Tauri 模式下真实 Vault 文件树（路径作 id） */
import { create } from 'zustand'
import type { VFSNode, VFSState } from '../vfs/types'
import {
  createVaultFile,
  createVaultFolder,
  deleteVaultEntry,
  listVaultTree,
  readVaultFile,
  renameVaultEntry,
  setVaultRoot,
  writeVaultFile,
} from '../api/bridge'
import { entriesToNodes, firstFilePath, VAULT_ROOT_ID } from './tree'
import { useConnectionStore } from '../api/connection'
import { persistVaultActiveFile, useVaultUiStore } from './vaultUiStore'
import { useEditorSplitStore, getPaneActiveFile } from '../editor/editorSplitStore'

interface VaultActions extends VFSState {
  ready: boolean
  error: string | null
  refreshTree: () => Promise<void>
  initFromVaultPath: (path: string) => Promise<void>
  createFile: (parentId: string, name: string, content?: string) => Promise<string>
  createFolder: (parentId: string, name: string) => Promise<string>
  renameNode: (id: string, newName: string) => Promise<void>
  deleteNode: (id: string) => Promise<void>
  moveNode: (id: string, newParentId: string) => void
  openFile: (id: string, options?: { force?: boolean; prefetch?: boolean }) => Promise<void>
  prefetchFile: (id: string) => Promise<void>
  getChildren: (folderId: string) => VFSNode[]
  updateContent: (id: string, content: string) => void
  saveActiveFile: () => Promise<void>
}

export const useVaultStore = create<VaultActions>()((set, get) => ({
  nodes: {},
  rootId: VAULT_ROOT_ID,
  activeFileId: null,
  ready: false,
  error: null,

  async refreshTree() {
    try {
      const root = await listVaultTree()
      const nodes = entriesToNodes(root)
      const state = get()
      const prev = state.nodes
      for (const [id, node] of Object.entries(nodes)) {
        if (node.type === 'file' && prev[id]?.content !== undefined) {
          nodes[id] = { ...node, content: prev[id].content }
        }
      }
      let activeFileId = state.activeFileId
      const vaultPath = useConnectionStore.getState().vaultPath
      const split = useEditorSplitStore.getState()
      if (split._hydrated) {
        split.sanitizePanes(nodes)
        const focused = split.panes.find((p) => p.id === split.focusedPaneId)
        const tabId = focused ? getPaneActiveFile(focused) : null
        if (tabId && nodes[tabId]?.type === 'file') {
          activeFileId = tabId
        }
      }
      if (!activeFileId && vaultPath.trim()) {
        const restored = useVaultUiStore.getState().getLastActiveFile(vaultPath)
        if (restored && nodes[restored]?.type === 'file') {
          activeFileId = restored
        }
      }
      if (activeFileId && !nodes[activeFileId]) {
        activeFileId = firstFilePath(nodes)
      }
      if (!activeFileId) {
        activeFileId = firstFilePath(nodes)
      }
      set({ nodes, rootId: VAULT_ROOT_ID, activeFileId, ready: true, error: null })
      if (activeFileId) {
        const active = get().nodes[activeFileId]
        if (active?.type === 'file' && active.content === undefined) {
          await get().openFile(activeFileId)
        }
      }
    } catch (e) {
      set({
        ready: false,
        error: e instanceof Error ? e.message : '加载 Vault 失败',
      })
    }
  },

  async initFromVaultPath(path: string) {
    const trimmed = path.trim()
    if (!trimmed) {
      set({ ready: false, error: '请先选择 Vault 目录' })
      return
    }
    try {
      await setVaultRoot(trimmed)
      await get().refreshTree()
    } catch (e) {
      set({
        ready: false,
        error: e instanceof Error ? e.message : 'Vault 初始化失败',
      })
    }
  },

  async createFile(parentId, name, content) {
    const path = await createVaultFile(parentId, name, content)
    await get().refreshTree()
    await get().openFile(path)
    return path
  },

  async createFolder(parentId, name) {
    const path = await createVaultFolder(parentId, name)
    await get().refreshTree()
    return path
  },

  async renameNode(id, newName) {
    const wasActive = get().activeFileId === id
    const newPath = await renameVaultEntry(id, newName)
    if (wasActive) {
      set({ activeFileId: newPath })
      persistVaultActiveFile(newPath)
    }
    useEditorSplitStore.getState().remapFileId(id, newPath)
    await get().refreshTree()
  },

  async deleteNode(id) {
    await deleteVaultEntry(id)
    const wasActive = get().activeFileId === id
    useEditorSplitStore.getState().removeFileFromPanes(id)
    await get().refreshTree()
    if (wasActive) {
      const next = firstFilePath(get().nodes)
      set({ activeFileId: next })
      persistVaultActiveFile(next)
    }
  },

  moveNode() {
    // Phase 1b 暂不支持跨目录拖拽
  },

  async openFile(id, options) {
    const node = get().nodes[id]
    if (!node || node.type !== 'file') return
    if (/\.pdf$/i.test(node.name)) {
      if (!options?.prefetch) {
        set({ activeFileId: id })
        persistVaultActiveFile(id)
      }
      return
    }
    try {
      const content = await readVaultFile(id)
      if (
        !options?.force &&
        !options?.prefetch &&
        node.content === content &&
        get().activeFileId === id
      ) {
        return
      }
      if (options?.prefetch) {
        set((state) => ({
          nodes: {
            ...state.nodes,
            [id]: { ...node, content },
          },
        }))
        return
      }
      set((state) => ({
        activeFileId: id,
        nodes: {
          ...state.nodes,
          [id]: { ...node, content },
        },
      }))
      persistVaultActiveFile(id)
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '打开文件失败' })
    }
  },

  async prefetchFile(id) {
    await get().openFile(id, { prefetch: true })
  },

  getChildren(folderId) {
    const state = get()
    const folder = state.nodes[folderId]
    if (!folder?.children) return []
    return folder.children.map((cid) => state.nodes[cid]).filter(Boolean)
  },

  updateContent(id, content) {
    set((state) => ({
      nodes: {
        ...state.nodes,
        [id]: { ...state.nodes[id], content },
      },
    }))
  },

  async saveActiveFile() {
    const { activeFileId, nodes } = get()
    if (!activeFileId) return
    const file = nodes[activeFileId]
    if (!file || file.type !== 'file') return
    await writeVaultFile(activeFileId, file.content ?? '')
  },
}))
