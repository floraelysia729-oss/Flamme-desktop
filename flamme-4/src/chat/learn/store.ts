import { create } from 'zustand'
import type { EvidenceItem, LearnNote } from './types'
import { emptyLearnNote } from './noteTemplate'
import { normalizeLearnNote } from './migrateLearnMind'

interface LearnState {
  learnNote: LearnNote
  userEdited: boolean
  evidencePack: EvidenceItem[]
  archivedNotePath: string | null
  lastArchivedAt: string | null
  lastArchivedMessageIdx: number
  contextPressure: 'warn' | 'critical' | null
  driftToast: string | null
  setLearnNote: (note: LearnNote, fromUser?: boolean) => void
  mergeLearnNoteFromAi: (note: LearnNote, drift?: string | null) => 'applied' | 'skipped'
  setEvidencePack: (items: EvidenceItem[]) => void
  setArchiveMeta: (path: string | null, at: string | null, idx: number) => void
  setContextPressure: (level: 'warn' | 'critical' | null) => void
  setDriftToast: (msg: string | null) => void
  resetLearn: (topic?: string) => void
}

export const useLearnStore = create<LearnState>((set, get) => ({
  learnNote: emptyLearnNote(),
  userEdited: false,
  evidencePack: [],
  archivedNotePath: null,
  lastArchivedAt: null,
  lastArchivedMessageIdx: 0,
  contextPressure: null,
  driftToast: null,

  setLearnNote: (note, fromUser = false) =>
    set({ learnNote: note, userEdited: fromUser ? true : get().userEdited }),

  mergeLearnNoteFromAi: (note, drift = null) => {
    if (get().userEdited) return 'skipped'
    set({ learnNote: note, userEdited: false, driftToast: drift })
    if (drift) {
      setTimeout(() => {
        if (get().driftToast === drift) set({ driftToast: null })
      }, 5000)
    }
    return 'applied'
  },

  setEvidencePack: (items) => set({ evidencePack: items }),

  setArchiveMeta: (path, at, idx) =>
    set({ archivedNotePath: path, lastArchivedAt: at, lastArchivedMessageIdx: idx }),

  setContextPressure: (level) => set({ contextPressure: level }),

  setDriftToast: (msg) => set({ driftToast: msg }),

  resetLearn: (topic) =>
    set({
      learnNote: emptyLearnNote(topic),
      userEdited: false,
      evidencePack: [],
      archivedNotePath: null,
      lastArchivedAt: null,
      lastArchivedMessageIdx: 0,
      contextPressure: null,
      driftToast: null,
    }),
}))

/** 从 API 加载 learn_mind / learn_note 字段 */
export function loadLearnNoteFromSession(raw: unknown): LearnNote {
  return normalizeLearnNote(raw)
}
