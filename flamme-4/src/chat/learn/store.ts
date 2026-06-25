import { create } from 'zustand'
import type { ChatMessage } from '../types'
import type { EvidenceItem, LearnNote } from './types'
import { emptyLearnNote } from './noteTemplate'
import { normalizeLearnNote } from './migrateLearnMind'
import { resetMasteryQuiz } from './masteryQuizStore'
import { getQaSummariesContent, rebuildQaMessageLinks } from './qaMessageLinks'

interface LearnState {
  learnNote: LearnNote
  userEdited: boolean
  evidencePack: EvidenceItem[]
  archivedNotePath: string | null
  lastArchivedAt: string | null
  lastArchivedMessageIdx: number
  contextPressure: 'warn' | 'critical' | null
  driftToast: string | null
  qaMessageLinks: Record<number, number>
  setLearnNote: (note: LearnNote, fromUser?: boolean) => void
  mergeLearnNoteFromAi: (note: LearnNote, drift?: string | null) => 'applied' | 'skipped'
  setEvidencePack: (items: EvidenceItem[]) => void
  setArchiveMeta: (path: string | null, at: string | null, idx: number) => void
  setContextPressure: (level: 'warn' | 'critical' | null) => void
  setDriftToast: (msg: string | null) => void
  setQaMessageLink: (round: number, messageIdx: number) => void
  rebuildQaMessageLinksFromMessages: (messages: ChatMessage[], note?: LearnNote) => void
  getMessageIdxForRound: (round: number) => number | undefined
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
  qaMessageLinks: {},

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

  setQaMessageLink: (round, messageIdx) =>
    set((s) => ({
      qaMessageLinks: { ...s.qaMessageLinks, [round]: messageIdx },
    })),

  rebuildQaMessageLinksFromMessages: (messages, note?) => {
    const learnNote = note ?? get().learnNote
    const qaContent = getQaSummariesContent(learnNote.sections)
    set({ qaMessageLinks: rebuildQaMessageLinks(messages, qaContent) })
  },

  getMessageIdxForRound: (round) => get().qaMessageLinks[round],

  resetLearn: (topic) => {
    resetMasteryQuiz()
    set({
      learnNote: emptyLearnNote(topic),
      userEdited: false,
      evidencePack: [],
      archivedNotePath: null,
      lastArchivedAt: null,
      lastArchivedMessageIdx: 0,
      contextPressure: null,
      driftToast: null,
      qaMessageLinks: {},
    })
  },
}))

/** 从 API 加载 learn_mind / learn_note 字段 */
export function loadLearnNoteFromSession(raw: unknown): LearnNote {
  return normalizeLearnNote(raw)
}
