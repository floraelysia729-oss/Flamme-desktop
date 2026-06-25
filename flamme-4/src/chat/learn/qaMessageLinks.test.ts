import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../types'
import {
  hasLearningSignal,
  parseQaBlocks,
  rebuildQaMessageLinks,
} from './qaMessageLinks'

describe('hasLearningSignal', () => {
  it('rejects low-signal short exchange', () => {
    expect(hasLearningSignal('好的', '简短回复')).toBe(false)
    expect(hasLearningSignal('谢谢', '不客气')).toBe(false)
  })

  it('accepts real questions', () => {
    expect(hasLearningSignal('什么是线性代数？', '线性代数是…')).toBe(true)
    expect(hasLearningSignal('帮我讲讲矩阵乘法', '矩阵乘法…')).toBe(true)
  })

  it('accepts gap signals and substantive user messages', () => {
    expect(hasLearningSignal('还是不太懂', '我们再来看')).toBe(true)
    expect(hasLearningSignal('我理解了特征值定义', '好的')).toBe(true)
  })
})

describe('parseQaBlocks', () => {
  it('parses multiple rounds with misconception', () => {
    const content = `### R002
**问题**：特征值是什么
**原理**：Av=λv
**误区**：与行列式混淆

### R001
**问题**：矩阵是什么
**原理**：数表`

    const blocks = parseQaBlocks(content)
    expect(blocks).toHaveLength(2)
    expect(blocks[0].round).toBe(2)
    expect(blocks[0].question).toBe('特征值是什么')
    expect(blocks[0].misconception).toBe('与行列式混淆')
    expect(blocks[1].round).toBe(1)
  })

  it('returns empty for placeholder', () => {
    expect(parseQaBlocks('（对话后将在此记录每轮问答摘要）')).toEqual([])
    expect(parseQaBlocks('')).toEqual([])
  })
})

describe('rebuildQaMessageLinks', () => {
  const messages: ChatMessage[] = [
    { role: 'user', content: '好的' },
    { role: 'assistant', content: '继续' },
    { role: 'user', content: '什么是特征值？' },
    { role: 'assistant', content: '特征值是满足 Av=λv 的标量 λ，它在许多实际问题中…' },
    { role: 'user', content: '谢谢' },
    { role: 'assistant', content: '不客气' },
    { role: 'user', content: '怎么求特征值' },
    { role: 'assistant', content: '求特征值需要解特征方程 det(A-λI)=0，步骤如下…' },
  ]

  const qaContent = `### R002
**问题**：怎么求特征值
**原理**：解特征方程

### R001
**问题**：什么是特征值
**原理**：Av=λv`

  it('maps rounds to user indices skipping low-signal turns', () => {
    const links = rebuildQaMessageLinks(messages, qaContent)
    expect(links[1]).toBe(2)
    expect(links[2]).toBe(6)
  })
})
