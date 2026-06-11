import { create } from 'zustand'

import { persist } from 'zustand/middleware'

import type { ChatMessage, ChatMode } from './types'



interface ChatUiState {

  defaultMode: ChatMode

  sessionId: string

  messages: ChatMessage[]

  mode: ChatMode

  selectedFiles: string[]

  streaming: boolean

  lastLearnSessionId: string | null

  lastSearchSessionId: string | null

  historySidebarOpen: boolean

  setDefaultMode: (mode: ChatMode) => void

  setMode: (mode: ChatMode) => void

  setSelectedFiles: (files: string[]) => void

  toggleLearnFile: (path: string) => void

  setLearnScope: (paths: string[]) => void

  setMessages: (messages: ChatMessage[]) => void

  setStreaming: (v: boolean) => void

  setSessionId: (id: string) => void

  setHistorySidebarOpen: (open: boolean) => void

  newSession: () => void

}



function newSessionId() {

  return crypto.randomUUID()

}



export const useChatStore = create<ChatUiState>()(

  persist(

    (set, get) => ({

      defaultMode: 'search',

      sessionId: newSessionId(),

      messages: [],

      mode: 'search',

      selectedFiles: [],

      streaming: false,

      lastLearnSessionId: null,

      lastSearchSessionId: null,

      historySidebarOpen: true,



      setDefaultMode: (mode) => set({ defaultMode: mode, mode }),

      setMode: (mode) => {

        const cur = get()

        const sid = cur.sessionId

        if (cur.mode === 'learn') {

          set({ lastLearnSessionId: sid })

        } else {

          set({ lastSearchSessionId: sid })

        }

        const restore =
          mode === 'learn' ? cur.lastLearnSessionId : cur.lastSearchSessionId
        set({
          mode,
          messages: [],
          selectedFiles: mode === 'search' ? [] : cur.selectedFiles,
          sessionId: restore ?? newSessionId(),
          historySidebarOpen: mode === 'learn' ? false : cur.historySidebarOpen,
        })
      },

      setSelectedFiles: (files) => set({ selectedFiles: files }),

      toggleLearnFile: (path) => {

        const norm = path.replace(/\\/g, '/')

        const cur = get().selectedFiles

        if (cur.includes(norm)) {

          set({ selectedFiles: cur.filter((p) => p !== norm) })

        } else {

          set({ selectedFiles: [...cur, norm] })

        }

      },

      setLearnScope: (paths) =>
        set({ selectedFiles: paths.map((p) => p.replace(/\\/g, '/')) }),

      setMessages: (messages) => set({ messages }),

      setStreaming: (streaming) => set({ streaming }),

      setSessionId: (id) => set({ sessionId: id }),

      setHistorySidebarOpen: (open) => set({ historySidebarOpen: open }),

      newSession: () => {

        const id = newSessionId()

        set({

          sessionId: id,

          messages: [],

          streaming: false,

        })

        if (get().mode === 'learn') {

          set({ lastLearnSessionId: id })

        } else {

          set({ lastSearchSessionId: id })

        }

      },

    }),

    {

      name: 'flamme-chat',

      partialize: (s) => ({

        defaultMode: s.defaultMode,

        lastLearnSessionId: s.lastLearnSessionId,

        lastSearchSessionId: s.lastSearchSessionId,

        historySidebarOpen: s.historySidebarOpen,

      }),

      onRehydrateStorage: () => (state) => {

        if (state) {

          state.mode = state.defaultMode
          if (state.mode === 'learn') {
            state.historySidebarOpen = false
          }

        }

      },

    },

  ),

)


