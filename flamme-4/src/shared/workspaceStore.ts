import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useChatUiStore } from './chatUiStore'

export type WorkspaceMode = 'read' | 'split' | 'chat'

interface WorkspaceState {
  mode: WorkspaceMode
  sidebarCollapsed: boolean
  setMode: (mode: WorkspaceMode) => void
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  cycleMode: () => void
  /** Ctrl+Shift+M：阅读 ↔ 分屏/专注对话 */
  toggleChatWorkspace: (chatMode?: 'search' | 'learn') => void
}

const MODE_ORDER: WorkspaceMode[] = ['read', 'split', 'chat']

function syncChatOpen(mode: WorkspaceMode) {
  useChatUiStore.getState().setOpen(mode === 'split' || mode === 'chat')
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      mode: 'read',
      sidebarCollapsed: false,

      setMode: (mode) => {
        if (mode === 'chat') {
          set({ mode, sidebarCollapsed: true })
        } else {
          set({ mode })
        }
        syncChatOpen(mode)
      },

      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

      cycleMode: () => {
        const cur = get().mode
        const idx = MODE_ORDER.indexOf(cur)
        get().setMode(MODE_ORDER[(idx + 1) % MODE_ORDER.length])
      },

      toggleChatWorkspace: (chatMode = 'search') => {
        const { mode } = get()
        if (mode === 'read') {
          get().setMode(chatMode === 'learn' ? 'chat' : 'split')
        } else {
          get().setMode('read')
        }
      },
    }),
    {
      name: 'flamme-workspace',
      partialize: (s) => ({
        mode: s.mode,
        sidebarCollapsed: s.sidebarCollapsed,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) syncChatOpen(state.mode)
      },
    },
  ),
)
