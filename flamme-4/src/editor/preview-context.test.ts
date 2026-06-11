import { describe, expect, it } from 'vitest'
import { scanMathRanges } from './math-ranges'
import { posInRanges } from './preview-context'

describe('preview-context', () => {
  it('scanMathRanges finds inline and block math', () => {
    const doc = 'a $x$ b\n\n$$y=z$$\n'
    const ranges = scanMathRanges(doc)
    expect(ranges).toHaveLength(2)
    expect(ranges[0].display).toBe(false)
    expect(ranges[1].display).toBe(true)
  })

  it('posInRanges uses sorted ranges', () => {
    const ranges = [
      { from: 10, to: 15 },
      { from: 20, to: 25 },
    ]
    expect(posInRanges(12, ranges)).toBe(true)
    expect(posInRanges(18, ranges)).toBe(false)
    expect(posInRanges(22, ranges)).toBe(true)
  })
})
