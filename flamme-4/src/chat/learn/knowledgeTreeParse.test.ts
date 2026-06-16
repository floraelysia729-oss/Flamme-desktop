import { describe, expect, it } from 'vitest'
import {
  analyzeKnowledgeTree,
  parseKnowledgeTree,
  pathKey,
  shouldDefaultExpand,
} from './knowledgeTreeParse'

const SAMPLE = `□ 未命名学习
├─ ✓ 广义积分与级数
│  └─ ✓ 极限比较法
├─ □ 常微分方程
└─ → 第二类曲线积分
   └─ → 格林公式挖奇点方向`

describe('parseKnowledgeTree', () => {
  it('parses nested tree with statuses', () => {
    const roots = parseKnowledgeTree(SAMPLE)
    expect(roots).toHaveLength(1)
    expect(roots[0].label).toBe('未命名学习')
    expect(roots[0].children).toHaveLength(3)
    expect(roots[0].children[2].status).toBe('current')
    expect(roots[0].children[2].label).toBe('第二类曲线积分')
    expect(roots[0].children[2].children[0].label).toBe('格林公式挖奇点方向')
    expect(roots[0].children[2].children[0].status).toBe('current')
  })
})

describe('analyzeKnowledgeTree', () => {
  it('finds deepest current path and next todo', () => {
    const analysis = analyzeKnowledgeTree(SAMPLE)
    expect(analysis.currentPath.map((n) => n.label)).toEqual([
      '未命名学习',
      '第二类曲线积分',
      '格林公式挖奇点方向',
    ])
    expect(analysis.currentPathKeys.has(pathKey([0, 2, 0]))).toBe(true)
    expect(analysis.nextStep?.label).toBe('常微分方程')
    expect(analysis.stats.learned).toBe(2)
    expect(analysis.stats.current).toBe(2)
  })

  it('expands nodes on current path', () => {
    const analysis = analyzeKnowledgeTree(SAMPLE)
    expect(shouldDefaultExpand(pathKey([0]), analysis.currentPathKeys, 0)).toBe(true)
    expect(shouldDefaultExpand(pathKey([0, 2]), analysis.currentPathKeys, 1)).toBe(true)
    expect(shouldDefaultExpand(pathKey([0, 1]), analysis.currentPathKeys, 1)).toBe(false)
  })
})
