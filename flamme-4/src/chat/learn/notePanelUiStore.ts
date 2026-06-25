import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const LEGACY_WIDTH_KEY = 'flamme-learn-note-width'
const DEFAULT_WIDTH = 320
const MIN_WIDTH = 220
const MAX_WIDTH = 480

function loadLegacyWidth(): number {
  try {
    const n = Number(localStorage.getItem(LEGACY_WIDTH_KEY))
    if (Number.isFinite(n) && n >= MIN_WIDTH && n <= MAX_WIDTH) return n
  } catch {
    /* ignore */
  }
  return DEFAULT_WIDTH
}

interface NotePanelUiState {
  open: boolean
  width: number
  setOpen: (open: boolean) => void
  toggleOpen: () => void
  setWidth: (width: number) => void
}

export const NOTE_PANEL_MIN_WIDTH = MIN_WIDTH
export const NOTE_PANEL_MAX_WIDTH = MAX_WIDTH
export const NOTE_PANEL_DEFAULT_WIDTH = DEFAULT_WIDTH

export const useNotePanelUiStore = create<NotePanelUiState>()(
  persist(
    (set) => ({
      open: true,
      width: loadLegacyWidth(),

      setOpen: (open) => set({ open }),
      toggleOpen: () => set((s) => ({ open: !s.open })),
      setWidth: (width) =>
        set({ width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width)) }),
    }),
    {
      name: 'flamme-learn-note-ui',
      partialize: (s) => ({ open: s.open, width: s.width }),
    },
  ),
)
