import { describe, expect, it } from 'vitest'
import { formatWrongLogSection } from './archiveLearnNote'
import { dedupeWrongEntries } from './masteryQuizUtils'
import type { MasteryWrongEntry } from './types'

describe('formatWrongLogSection', () => {
  it('returns empty string when no wrong entries', () => {
    expect(formatWrongLogSection([])).toBe('')
  })

  it('formats wrong entries for archive markdown', () => {
    const entries: MasteryWrongEntry[] = [
      {
        id: 'a1',
        targetLabel: '特征值',
        question: '什么是特征值？',
        userAnswer: '不知道',
        explanation: '参考答案：特征值是矩阵的重要不变量。',
        at: '2026-06-17T10:00:00',
      },
    ]
    const md = formatWrongLogSection(entries)
    expect(md).toContain('## 错题回顾')
    expect(md).toContain('参考答案：特征值是矩阵的重要不变量。')
  })

  it('dedupes duplicate questions in archive', () => {
    const entries: MasteryWrongEntry[] = [
      {
        id: '1',
        targetLabel: '重载',
        question: 'Q?',
        userAnswer: '不会',
        explanation: 'a',
        at: 't1',
      },
      {
        id: '2',
        targetLabel: '重载',
        question: 'Q?',
        userAnswer: '不知道',
        explanation: 'b',
        at: 't2',
      },
    ]
    expect(dedupeWrongEntries(entries)).toHaveLength(1)
    const md = formatWrongLogSection(entries)
    expect(md.match(/\*\*题目\*\*/g)?.length).toBe(1)
  })
})
