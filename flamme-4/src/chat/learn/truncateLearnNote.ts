import type { ChatMessage } from '../types'
import type { LearnNote, LearnSectionId } from './types'
import { emptyLearnNote } from './noteTemplate'
import { updateSection } from './noteEdit'
import {
  countLearningTurns,
  formatQaBlocks,
  getQaSummariesContent,
  parseQaBlocks,
} from './qaMessageLinks'

const RESET_SECTIONS: LearnSectionId[] = [
  'knowledge_tree',
  'types_and_conclusions',
  'learning_progress',
]

/** 编辑用户消息前，回滚学习笔记中将被覆盖的轮次 */
export function truncateLearnNoteForEdit(
  note: LearnNote,
  messages: ChatMessage[],
  editUserIdx: number,
): LearnNote {
  if (editUserIdx < 0 || editUserIdx % 2 !== 0) return note

  const before = messages.slice(0, editUserIdx)
  const hadLater = messages.length > editUserIdx + 1
  const learningCount = countLearningTurns(before)

  const blocks = parseQaBlocks(getQaSummariesContent(note.sections))
  const kept = [...blocks].sort((a, b) => a.round - b.round).slice(0, learningCount)
  const newQa = formatQaBlocks(kept)

  let next = updateSection(note, 'qa_summaries', newQa)
  next = {
    ...next,
    qaRound: kept.length ? Math.max(...kept.map((b) => b.round)) : 0,
  }

  if (hadLater) {
    const empty = emptyLearnNote(note.rootTopic)
    next = {
      ...next,
      sections: next.sections.map((s) => {
        if (!RESET_SECTIONS.includes(s.id)) return s
        const blank = empty.sections.find((x) => x.id === s.id)
        return blank ? { ...s, content: blank.content } : s
      }),
    }
  }

  return next
}
