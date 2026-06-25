import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { pushHideReplaceRanges, spansMultipleLines } from './decoration-ranges'

function mockView(doc: string): EditorView {
  const state = EditorState.create({ doc })
  return { state } as EditorView
}

describe('decoration-ranges', () => {
  it('detects multiline spans', () => {
    const view = mockView('aa\nbb')
    expect(spansMultipleLines(view, 0, 3)).toBe(true)
    expect(spansMultipleLines(view, 0, 2)).toBe(false)
  })

  it('clips hide ranges to single lines', () => {
    const view = mockView('[link](http://a.com)\nnext')
    const ranges: { from: number; to: number }[] = []
    pushHideReplaceRanges(view, ranges, 0, 22)
    for (const r of ranges) {
      expect(spansMultipleLines(view, r.from, r.to)).toBe(false)
    }
    expect(ranges.length).toBeGreaterThan(0)
  })
})
