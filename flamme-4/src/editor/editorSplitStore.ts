import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { VFSNode } from '../vfs/types'
import { getFileStore } from '../files'

const MAX_PANES = 3
const DEFAULT_WEIGHT = 1

export interface PaneUiState {
  outlineOpen: boolean
}

export interface EditorPaneSlot {
  id: string
  tabIds: string[]
  activeTabId: string | null
}

const defaultPaneUi = (): PaneUiState => ({
  outlineOpen: false,
})

export function getPaneActiveFile(pane: EditorPaneSlot): string | null {
  if (pane.activeTabId && pane.tabIds.includes(pane.activeTabId)) return pane.activeTabId
  return pane.tabIds[pane.tabIds.length - 1] ?? null
}

interface EditorSplitState {
  panes: EditorPaneSlot[]
  focusedPaneId: string
  weights: number[]
  paneUi: Record<string, PaneUiState>
  _hydrated: boolean
  focusPane: (paneId: string) => void
  openInFocusedPane: (fileId: string) => void
  openInPane: (paneId: string, fileId: string) => void
  openInNewPane: (fileId: string) => void
  selectTab: (paneId: string, fileId: string) => void
  closeTab: (paneId: string, fileId: string) => void
  splitRight: () => void
  closePane: (paneId: string) => void
  setWeights: (weights: number[]) => void
  syncPrimaryFile: (fileId: string | null) => void
  removeFileFromPanes: (fileId: string) => void
  remapFileId: (fromId: string, toId: string) => void
  getPaneUi: (paneId: string) => PaneUiState
  togglePaneOutline: (paneId: string) => void
  sanitizePanes: (nodes?: Record<string, VFSNode>) => void
  setHydrated: () => void
}

function newPaneId(): string {
  return `pane-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function createPane(fileId: string | null = null): EditorPaneSlot {
  return {
    id: newPaneId(),
    tabIds: fileId ? [fileId] : [],
    activeTabId: fileId,
  }
}

function patchPaneTabs(
  pane: EditorPaneSlot,
  fileId: string,
): EditorPaneSlot {
  const has = pane.tabIds.includes(fileId)
  return {
    ...pane,
    tabIds: has ? pane.tabIds : [...pane.tabIds, fileId],
    activeTabId: fileId,
  }
}

function normalizePane(p: Partial<EditorPaneSlot> & { id: string }): EditorPaneSlot {
  if (p.tabIds) {
    return {
      id: p.id,
      tabIds: p.tabIds,
      activeTabId:
        p.activeTabId && p.tabIds.includes(p.activeTabId)
          ? p.activeTabId
          : (p.tabIds[p.tabIds.length - 1] ?? null),
    }
  }
  const legacyFileId = (p as { fileId?: string | null }).fileId ?? null
  return {
    id: p.id,
    tabIds: legacyFileId ? [legacyFileId] : [],
    activeTabId: legacyFileId,
  }
}

const initialPane = createPane()

export const useEditorSplitStore = create<EditorSplitState>()(
  persist(
    (set, get) => ({
      panes: [initialPane],
      focusedPaneId: initialPane.id,
      weights: [DEFAULT_WEIGHT],
      paneUi: { [initialPane.id]: defaultPaneUi() },
      _hydrated: false,

      setHydrated: () => set({ _hydrated: true }),

      getPaneUi: (paneId) => get().paneUi[paneId] ?? defaultPaneUi(),

      togglePaneOutline: (paneId) => {
        set((s) => {
          const cur = s.paneUi[paneId] ?? defaultPaneUi()
          return {
            paneUi: { ...s.paneUi, [paneId]: { ...cur, outlineOpen: !cur.outlineOpen } },
          }
        })
      },

      focusPane: (paneId) => {
        if (!get().panes.some((p) => p.id === paneId)) return
        set({ focusedPaneId: paneId })
      },

      openInFocusedPane: (fileId) => {
        get().openInPane(get().focusedPaneId, fileId)
      },

      openInPane: (paneId, fileId) => {
        if (!get().panes.some((p) => p.id === paneId)) return
        set((s) => ({
          panes: s.panes.map((p) => (p.id === paneId ? patchPaneTabs(p, fileId) : p)),
          focusedPaneId: paneId,
        }))
      },

      selectTab: (paneId, fileId) => {
        const pane = get().panes.find((p) => p.id === paneId)
        if (!pane?.tabIds.includes(fileId)) return
        set({
          panes: get().panes.map((p) =>
            p.id === paneId ? { ...p, activeTabId: fileId } : p,
          ),
          focusedPaneId: paneId,
        })
      },

      closeTab: (paneId, fileId) => {
        set((s) => ({
          panes: s.panes.map((p) => {
            if (p.id !== paneId) return p
            const idx = p.tabIds.indexOf(fileId)
            if (idx < 0) return p
            const tabIds = p.tabIds.filter((id) => id !== fileId)
            let activeTabId = p.activeTabId
            if (p.activeTabId === fileId) {
              activeTabId = tabIds[Math.min(idx, tabIds.length - 1)] ?? null
            }
            return { ...p, tabIds, activeTabId }
          }),
        }))
      },

      openInNewPane: (fileId) => {
        const { panes, focusedPaneId, weights } = get()
        if (panes.length >= MAX_PANES) {
          get().openInFocusedPane(fileId)
          return
        }
        const idx = panes.findIndex((p) => p.id === focusedPaneId)
        const insertAt = idx >= 0 ? idx + 1 : panes.length
        const pane = createPane(fileId)
        const nextPanes = [...panes]
        nextPanes.splice(insertAt, 0, pane)
        const nextWeights = [...weights]
        nextWeights.splice(insertAt, 0, DEFAULT_WEIGHT)
        set((s) => ({
          panes: nextPanes,
          weights: nextWeights,
          focusedPaneId: pane.id,
          paneUi: { ...s.paneUi, [pane.id]: defaultPaneUi() },
        }))
      },

      splitRight: () => {
        const { panes, focusedPaneId } = get()
        const focused = panes.find((p) => p.id === focusedPaneId)
        const fileId =
          (focused ? getPaneActiveFile(focused) : null) ?? getFileStore().activeFileId
        if (!fileId) return
        get().openInNewPane(fileId)
      },

      closePane: (paneId) => {
        const { panes, weights, focusedPaneId } = get()
        if (panes.length <= 1) return
        const idx = panes.findIndex((p) => p.id === paneId)
        if (idx < 0) return
        const nextPanes = panes.filter((p) => p.id !== paneId)
        const nextWeights = weights.filter((_, i) => i !== idx)
        let nextFocus = focusedPaneId
        if (focusedPaneId === paneId) {
          const neighbor = nextPanes[Math.min(idx, nextPanes.length - 1)]
          nextFocus = neighbor?.id ?? nextPanes[0].id
        }
        const nextPaneUi = { ...get().paneUi }
        delete nextPaneUi[paneId]
        set({
          panes: nextPanes,
          weights: nextWeights.length ? nextWeights : [DEFAULT_WEIGHT],
          focusedPaneId: nextFocus,
          paneUi: nextPaneUi,
        })
      },

      setWeights: (weights) => {
        const { panes } = get()
        if (weights.length !== panes.length) return
        set({ weights })
      },

      syncPrimaryFile: (fileId) => {
        if (!fileId) return
        const { panes, focusedPaneId } = get()
        const focused = panes.find((p) => p.id === focusedPaneId)
        if (getPaneActiveFile(focused!) === fileId) return
        get().openInPane(focusedPaneId, fileId)
      },

      removeFileFromPanes: (fileId) => {
        set((s) => ({
          panes: s.panes.map((p) => {
            if (!p.tabIds.includes(fileId)) return p
            const tabIds = p.tabIds.filter((id) => id !== fileId)
            const idx = p.tabIds.indexOf(fileId)
            let activeTabId = p.activeTabId
            if (p.activeTabId === fileId) {
              activeTabId = tabIds[Math.min(idx, tabIds.length - 1)] ?? null
            }
            return { ...p, tabIds, activeTabId }
          }),
        }))
      },

      remapFileId: (fromId, toId) => {
        set((s) => ({
          panes: s.panes.map((p) => ({
            ...p,
            tabIds: p.tabIds.map((id) => (id === fromId ? toId : id)),
            activeTabId: p.activeTabId === fromId ? toId : p.activeTabId,
          })),
        }))
      },

      sanitizePanes: (nodes) => {
        const fileNodes = nodes ?? getFileStore().nodes
        set((s) => {
          let panes: EditorPaneSlot[] = s.panes.map((p) => normalizePane(p)).map((p) => {
            const tabIds = p.tabIds.filter((id) => fileNodes[id]?.type === 'file')
            const activeTabId =
              p.activeTabId && tabIds.includes(p.activeTabId)
                ? p.activeTabId
                : (tabIds[tabIds.length - 1] ?? null)
            return { ...p, tabIds, activeTabId }
          })
          if (panes.length === 0) {
            const fallback = createPane()
            panes = [fallback]
          }
          let focusedPaneId = s.focusedPaneId
          if (!panes.some((p) => p.id === focusedPaneId)) {
            focusedPaneId = panes[0].id
          }
          const paneUi = { ...s.paneUi }
          for (const id of Object.keys(paneUi)) {
            if (!panes.some((p) => p.id === id)) delete paneUi[id]
          }
          for (const p of panes) {
            if (!paneUi[p.id]) paneUi[p.id] = defaultPaneUi()
          }
          const weights =
            s.weights.length === panes.length
              ? s.weights
              : panes.map(() => DEFAULT_WEIGHT)
          return { panes, focusedPaneId, paneUi, weights }
        })
      },
    }),
    {
      name: 'flamme-editor-split',
      partialize: (s) => ({
        panes: s.panes,
        focusedPaneId: s.focusedPaneId,
        weights: s.weights,
        paneUi: s.paneUi,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.panes = state.panes.map((p) => normalizePane(p))
          state.setHydrated()
        }
      },
    },
  ),
)
