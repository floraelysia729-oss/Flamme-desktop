import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const DEFAULT_WIDTH = 220
const MIN_WIDTH = 180
const MAX_WIDTH = 400

interface OutlineUiState {
  open: boolean
  width: number
  collapsedKeys: Record<string, string[]>
  setOpen: (open: boolean) => void
  toggleOpen: () => void
  setWidth: (width: number) => void
  getCollapsed: (filePath: string) => Set<string>
  toggleCollapsed: (filePath: string, key: string) => void
  expandAll: (filePath: string) => void
  collapseAll: (filePath: string, keys: string[]) => void
}

export const OUTLINE_MIN_WIDTH = MIN_WIDTH
export const OUTLINE_MAX_WIDTH = MAX_WIDTH
export const OUTLINE_DEFAULT_WIDTH = DEFAULT_WIDTH

export const useOutlineUiStore = create<OutlineUiState>()(
  persist(
    (set, get) => ({
      open: false,
      width: DEFAULT_WIDTH,
      collapsedKeys: {},

      setOpen: (open) => set({ open }),
      toggleOpen: () => set((s) => ({ open: !s.open })),
      setWidth: (width) =>
        set({ width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width)) }),

      getCollapsed: (filePath) => new Set(get().collapsedKeys[filePath] ?? []),

      toggleCollapsed: (filePath, key) => {
        const cur = new Set(get().collapsedKeys[filePath] ?? [])
        if (cur.has(key)) cur.delete(key)
        else cur.add(key)
        set((s) => ({
          collapsedKeys: { ...s.collapsedKeys, [filePath]: [...cur] },
        }))
      },

      expandAll: (filePath) =>
        set((s) => ({
          collapsedKeys: { ...s.collapsedKeys, [filePath]: [] },
        })),

      collapseAll: (filePath, keys) =>
        set((s) => ({
          collapsedKeys: { ...s.collapsedKeys, [filePath]: [...keys] },
        })),
    }),
    {
      name: 'flamme-outline-ui',
      partialize: (s) => ({
        open: s.open,
        width: s.width,
        collapsedKeys: s.collapsedKeys,
      }),
    },
  ),
)
