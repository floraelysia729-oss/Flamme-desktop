/** Phase 1a 本地草稿 VFS；真 vault 同步后改走 api/bridge（见 docs/flamme-4-architecture.md） */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { VFSNode, VFSState } from './types'

interface VFSActions extends VFSState {
  createFile: (parentId: string, name: string, content?: string) => string
  createFolder: (parentId: string, name: string) => string
  renameNode: (id: string, newName: string) => void
  deleteNode: (id: string) => void
  moveNode: (id: string, newParentId: string) => void
  openFile: (id: string) => void
  getChildren: (folderId: string) => VFSNode[]
  updateContent: (id: string, content: string) => void
}

function initDefaultState(): VFSState {
  const rootId = crypto.randomUUID()
  const welcomeId = crypto.randomUUID()

  const root: VFSNode = {
    type: 'folder',
    name: 'Flamme',
    children: [welcomeId],
    parentId: null,
  }

  const welcome: VFSNode = {
    type: 'file',
    name: 'welcome.md',
    content: '# Welcome to Flamme\n\nStart writing...',
    parentId: rootId,
  }

  return {
    nodes: { [rootId]: root, [welcomeId]: welcome },
    rootId,
    activeFileId: welcomeId,
  }
}

const defaultState = initDefaultState()

export const useVFSStore = create<VFSActions>()(
  persist(
    (set, get) => ({
      nodes: defaultState.nodes,
      rootId: defaultState.rootId,
      activeFileId: defaultState.activeFileId,

      createFile(parentId, name, content) {
        const id = crypto.randomUUID()
        set((state) => {
          const node: VFSNode = {
            type: 'file',
            name,
            content: content ?? '',
            parentId,
          }
          const parent = state.nodes[parentId]
          return {
            nodes: {
              ...state.nodes,
              [id]: node,
              [parentId]: {
                ...parent,
                children: [...(parent.children ?? []), id],
              },
            },
          }
        })
        return id
      },

      createFolder(parentId, name) {
        const id = crypto.randomUUID()
        set((state) => {
          const node: VFSNode = {
            type: 'folder',
            name,
            children: [],
            parentId,
          }
          const parent = state.nodes[parentId]
          return {
            nodes: {
              ...state.nodes,
              [id]: node,
              [parentId]: {
                ...parent,
                children: [...(parent.children ?? []), id],
              },
            },
          }
        })
        return id
      },

      renameNode(id, newName) {
        set((state) => ({
          nodes: {
            ...state.nodes,
            [id]: { ...state.nodes[id], name: newName },
          },
        }))
      },

      deleteNode(id) {
        const state = get()
        const node = state.nodes[id]
        if (!node) return

        // Recursively delete children first
        if (node.type === 'folder' && node.children) {
          for (const childId of node.children) {
            get().deleteNode(childId)
          }
        }

        set((state) => {
          const { [id]: _removed, ...remaining } = state.nodes
          const parentId = node.parentId
          const parent = parentId ? state.nodes[parentId] : null

          return {
            nodes: parent
              ? {
                  ...remaining,
                  [parentId!]: {
                    ...parent,
                    children: parent.children?.filter((cid) => cid !== id),
                  },
                }
              : remaining,
            activeFileId:
              state.activeFileId === id ? null : state.activeFileId,
          }
        })
      },

      moveNode(id, newParentId) {
        set((state) => {
          const node = state.nodes[id]
          const oldParentId = node.parentId
          const oldParent = oldParentId ? state.nodes[oldParentId] : null
          const newParent = state.nodes[newParentId]

          return {
            nodes: {
              ...state.nodes,
              [id]: { ...node, parentId: newParentId },
              ...(oldParent
                ? {
                    [oldParentId!]: {
                      ...oldParent,
                      children: oldParent.children?.filter(
                        (cid) => cid !== id
                      ),
                    },
                  }
                : {}),
              ...(newParent
                ? {
                    [newParentId]: {
                      ...newParent,
                      children: [...(newParent.children ?? []), id],
                    },
                  }
                : {}),
            },
          }
        })
      },

      openFile(id) {
        set({ activeFileId: id })
      },

      getChildren(folderId) {
        const state = get()
        const folder = state.nodes[folderId]
        if (!folder?.children) return []
        return folder.children
          .map((cid) => state.nodes[cid])
          .filter(Boolean)
      },

      updateContent(id, content) {
        set((state) => ({
          nodes: {
            ...state.nodes,
            [id]: { ...state.nodes[id], content },
          },
        }))
      },
    }),
    {
      name: 'flamme-vfs',
      onRehydrateStorage: () => (state) => {
        if (!state) return
        const defaults = initDefaultState()
        if (Object.keys(state.nodes).length === 0 || !state.rootId || !state.nodes[state.rootId]) {
          state.nodes = defaults.nodes
          state.rootId = defaults.rootId
          state.activeFileId = defaults.activeFileId
          return
        }
        if (!state.activeFileId || !state.nodes[state.activeFileId]) {
          const welcomeId = Object.keys(state.nodes).find(
            (id) => state.nodes[id]?.type === 'file' && state.nodes[id]?.name === 'welcome.md',
          )
          state.activeFileId = welcomeId ?? defaults.activeFileId
        }
      },
    }
  )
)
