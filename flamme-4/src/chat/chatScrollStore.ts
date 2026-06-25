import { create } from 'zustand'

interface ChatScrollState {
  scrollTarget: number | null
  requestScrollToMessage: (idx: number) => void
  clearScrollTarget: () => void
}

export const useChatScrollStore = create<ChatScrollState>((set) => ({
  scrollTarget: null,
  requestScrollToMessage: (idx) => set({ scrollTarget: idx }),
  clearScrollTarget: () => set({ scrollTarget: null }),
}))
