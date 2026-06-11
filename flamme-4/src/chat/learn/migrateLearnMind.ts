import type { LearnMind, LearnNote } from './types'
import { emptyLearnNote } from './noteTemplate'

const STATUS_TO_PREFIX: Record<string, string> = {
  understood: '✓',
  exploring: '→',
  new: '□',
  gap: '□',
}

/** 旧 LearnMind → LearnNote v1 */
export function migrateLearnMindToNote(mind: LearnMind | null | undefined): LearnNote {
  if (!mind || !mind.topic) return emptyLearnNote()

  const note = emptyLearnNote(mind.topic)
  const treeLines: string[] = [`□ ${mind.topic}`]

  for (const c of mind.concepts ?? []) {
    const prefix = STATUS_TO_PREFIX[c.status] ?? '□'
    treeLines.push(`├─${prefix} ${c.label}`)
    if (c.note?.trim()) {
      treeLines.push(`│  ${c.note.trim().slice(0, 60)}`)
    }
  }

  const gaps = (mind.concepts ?? []).filter((c) => c.status === 'gap')
  const qaParts: string[] = []
  if (gaps.length > 0) {
    qaParts.push(
      '### R001（迁移）',
      `**问题**：${gaps[0].label}`,
      gaps[0].note ? `**误区**：${gaps[0].note}` : '',
    )
  }

  const conclusions =
    (mind.keyTakeaways ?? []).map((t) => `- ${t}`).join('\n') || '（无）'
  const progress = `## 当前主题\n${mind.topic}\n\n## 待解决\n${(mind.openQuestions ?? []).map((q) => `- ${q}`).join('\n') || '（无）'}\n\n## 下一步\n→ 继续学习`

  note.sections = note.sections.map((s) => {
    if (s.id === 'knowledge_tree') return { ...s, content: treeLines.join('\n') }
    if (s.id === 'qa_summaries' && qaParts.length)
      return { ...s, content: qaParts.filter(Boolean).join('\n') }
    if (s.id === 'types_and_conclusions')
      return {
        ...s,
        content: `## 题型\n\n（待沉淀）\n\n## 结论\n${conclusions}`,
      }
    if (s.id === 'learning_progress') return { ...s, content: progress }
    return s
  })
  note.qaRound = qaParts.length ? 1 : 0
  note.version = mind.version ?? 0
  return note
}

export function normalizeLearnNote(raw: unknown): LearnNote {
  if (!raw || typeof raw !== 'object') return emptyLearnNote()
  const o = raw as Record<string, unknown>
  if (o.schema === 'learn_note_v1' && Array.isArray(o.sections)) {
    return o as unknown as LearnNote
  }
  if ('concepts' in o || ('topic' in o && !('sections' in o))) {
    return migrateLearnMindToNote(o as unknown as LearnMind)
  }
  return emptyLearnNote()
}
