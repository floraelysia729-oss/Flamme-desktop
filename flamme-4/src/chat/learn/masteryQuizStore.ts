import { create } from 'zustand'
import { dedupeWrongEntries } from './masteryQuizUtils'
import type { MasteryQuizSession, MasteryWrongEntry } from './types'

interface MasteryQuizState {
  activeSession: MasteryQuizSession | null
  wrongLog: MasteryWrongEntry[]
  panelOpen: boolean
  setActiveSession: (session: MasteryQuizSession | null) => void
  setPanelOpen: (open: boolean) => void
  addWrongEntry: (entry: MasteryWrongEntry) => void
  markQuestionPassed: (questionId: string) => void
  advanceIndex: () => void
  reset: () => void
}

export const useMasteryQuizStore = create<MasteryQuizState>((set, get) => ({
  activeSession: null,
  wrongLog: [],
  panelOpen: false,

  setActiveSession: (session) => set({ activeSession: session }),

  setPanelOpen: (open) => set({ panelOpen: open }),

  addWrongEntry: (entry) =>
    set((s) => ({
      wrongLog: dedupeWrongEntries([...s.wrongLog, entry]),
    })),

  markQuestionPassed: (questionId) => {
    const cur = get().activeSession
    if (!cur) return
    const passedIds = cur.passedIds.includes(questionId)
      ? cur.passedIds
      : [...cur.passedIds, questionId]
    set({ activeSession: { ...cur, passedIds } })
  },

  advanceIndex: () => {
    const cur = get().activeSession
    if (!cur) return
    set({ activeSession: { ...cur, index: cur.index + 1 } })
  },

  reset: () => set({ activeSession: null, wrongLog: [], panelOpen: false }),
}))

export function resetMasteryQuiz() {
  useMasteryQuizStore.getState().reset()
}
