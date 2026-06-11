import type { LearnNote, LearnSectionId } from './types'

const EMPTY_SECTIONS: Record<LearnSectionId, string> = {
  knowledge_tree: '□ 未命名主题',
  qa_summaries: '（对话后将在此记录每轮问答摘要）',
  types_and_conclusions: `## 题型

（识别到可复用解题套路后将沉淀于此）

## 结论

（已确认的关键结论）`,
  learning_progress: `## 当前主题
未命名学习

## 待解决

## 下一步
→ 开始第一个问题`,
}

export function emptyLearnNote(rootTopic = '未命名学习'): LearnNote {
  const tree = rootTopic.trim() || '未命名学习'
  return {
    rootTopic: tree,
    sections: (Object.keys(EMPTY_SECTIONS) as LearnSectionId[]).map((id) => ({
      id,
      content:
        id === 'knowledge_tree'
          ? `□ ${tree}`
          : id === 'learning_progress'
            ? EMPTY_SECTIONS.learning_progress.replace('未命名学习', tree)
            : EMPTY_SECTIONS[id],
      locked: false,
    })),
    qaRound: 0,
    version: 0,
    updatedAt: new Date().toISOString(),
    schema: 'learn_note_v1',
  }
}
