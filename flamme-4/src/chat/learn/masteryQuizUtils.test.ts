import { describe, expect, it } from 'vitest'
import { dedupeWrongEntries } from './masteryQuizUtils'
import type { MasteryWrongEntry } from './types'

describe('dedupeWrongEntries', () => {
  it('keeps latest entry per target+question', () => {
    const entries: MasteryWrongEntry[] = [
      {
        id: '1',
        targetLabel: '重载',
        question: '同一题？',
        userAnswer: '不会',
        explanation: 'a',
        at: 't1',
      },
      {
        id: '2',
        targetLabel: '重载',
        question: '同一题？',
        userAnswer: '不知道',
        explanation: 'b',
        at: 't2',
      },
    ]
    const out = dedupeWrongEntries(entries)
    expect(out).toHaveLength(1)
    expect(out[0].userAnswer).toBe('不知道')
  })
})
