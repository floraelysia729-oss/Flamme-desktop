import { create } from 'zustand'

interface ChatUiState {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
}

export const useChatUiStore = create<ChatUiState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
}))
