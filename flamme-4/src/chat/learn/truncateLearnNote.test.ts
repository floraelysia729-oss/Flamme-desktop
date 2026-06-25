import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../types'
import { emptyLearnNote } from './noteTemplate'
import { formatQaBlocks } from './qaMessageLinks'
import { truncateLearnNoteForEdit } from './truncateLearnNote'

describe('truncateLearnNoteForEdit', () => {
  it('removes qa rounds after edit point and resets tree when later turns exist', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: '什么是特征值？' },
      { role: 'assistant', content: '特征值是满足 Av=λv 的标量…' },
      { role: 'user', content: '怎么求特征值' },
      { role: 'assistant', content: '解特征方程 det(A-λI)=0…' },
    ]

    let note = emptyLearnNote('线性代数')
    note = {
      ...note,
      qaRound: 2,
      sections: note.sections.map((s) => {
        if (s.id === 'qa_summaries') {
          return {
            ...s,
            content: formatQaBlocks([
              {
                round: 2,
                question: '怎么求',
                principle: '特征方程',
                misconception: null,
              },
              {
                round: 1,
                question: '什么是特征值',
                principle: 'Av=λv',
                misconception: null,
              },
            ]),
          }
        }
        if (s.id === 'knowledge_tree') {
          return { ...s, content: '□ 线性代数\n├─→ 特征值' }
        }
        return s
      }),
    }

    const out = truncateLearnNoteForEdit(note, messages, 0)
    const qa = out.sections.find((s) => s.id === 'qa_summaries')?.content ?? ''
    expect(qa).toContain('（对话后将在此记录每轮问答摘要）')
    expect(out.qaRound).toBe(0)
    expect(out.sections.find((s) => s.id === 'knowledge_tree')?.content).toContain('□ 线性代数')
    expect(out.sections.find((s) => s.id === 'knowledge_tree')?.content).not.toContain('特征值')
  })
})
