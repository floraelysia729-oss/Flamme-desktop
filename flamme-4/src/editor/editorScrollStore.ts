import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useConnectionStore } from '../api/connection'

export interface EditorScrollEntry {
  cursor: number
  scrollTop: number
  updatedAt: number
}

interface EditorScrollState {
  entries: Record<string, EditorScrollEntry>
  saveEntry: (key: string, cursor: number, scrollTop: number) => void
  getEntry: (key: string) => EditorScrollEntry | undefined
}

export function editorScrollKey(filePath: string): string {
  const vault = useConnectionStore.getState().vaultPath.trim() || '_default'
  const norm = filePath.replace(/\\/g, '/')
  return `${vault}::${norm}`
}

export const useEditorScrollStore = create<EditorScrollState>()(
  persist(
    (set, get) => ({
      entries: {},

      saveEntry(key, cursor, scrollTop) {
        set((s) => ({
          entries: {
            ...s.entries,
            [key]: {
              cursor: Math.max(0, cursor),
              scrollTop: Math.max(0, scrollTop),
              updatedAt: Date.now(),
            },
          },
        }))
      },

      getEntry(key) {
        return get().entries[key]
      },
    }),
    {
      name: 'flamme-editor-scroll',
      partialize: (s) => ({ entries: s.entries }),
    },
  ),
)

export function saveEditorScroll(filePath: string, cursor: number, scrollTop: number) {
  if (!filePath) return
  useEditorScrollStore.getState().saveEntry(editorScrollKey(filePath), cursor, scrollTop)
}

export function getEditorScroll(filePath: string): EditorScrollEntry | undefined {
  if (!filePath) return undefined
  return useEditorScrollStore.getState().getEntry(editorScrollKey(filePath))
}
