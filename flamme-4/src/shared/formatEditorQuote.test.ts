import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import {
  buildQuoteFromSelection,
  extractQuoteFromMessage,
  formatMessageWithQuote,
  selectionLineRange,
} from './formatEditorQuote'

function docOf(text: string) {
  return EditorState.create({ doc: text }).doc
}

describe('selectionLineRange', () => {
  it('returns single line for intra-line selection', () => {
    const doc = docOf('alpha\nbeta\ngamma')
    expect(selectionLineRange(doc, 0, 3)).toEqual({ lineFrom: 1, lineTo: 1 })
  })

  it('returns span for multi-line selection', () => {
    const doc = docOf('alpha\nbeta\ngamma')
    expect(selectionLineRange(doc, 1, 10)).toEqual({ lineFrom: 1, lineTo: 2 })
  })
})

describe('buildQuoteFromSelection', () => {
  it('returns null for empty selection', () => {
    const doc = docOf('hello')
    expect(buildQuoteFromSelection('a/b.md', 'b.md', doc, 2, 2)).toBeNull()
  })

  it('builds quote with normalized path', () => {
    const doc = docOf('line one\nline two')
    const quote = buildQuoteFromSelection('notes\\x.md', 'x.md', doc, 0, 7)
    expect(quote).toMatchObject({
      filePath: 'notes/x.md',
      fileName: 'x.md',
      text: 'line on',
      lineFrom: 1,
      lineTo: 1,
      from: 0,
      to: 7,
    })
  })
})

describe('formatMessageWithQuote', () => {
  const quote = {
    filePath: 'notes/a.md',
    fileName: 'a.md',
    text: 'selected\nlines',
    lineFrom: 12,
    lineTo: 15,
    from: 100,
    to: 120,
  }

  it('merges quote block with user text', () => {
    const msg = formatMessageWithQuote(quote, 'explain this')
    expect(msg).toBe(
      '> 来源：[[a.md]]（第 12–15 行）\n> selected\n> lines\n\nexplain this',
    )
  })

  it('returns quote only when user text empty', () => {
    expect(formatMessageWithQuote(quote, '')).toBe(
      '> 来源：[[a.md]]（第 12–15 行）\n> selected\n> lines',
    )
  })

  it('returns user text when no quote', () => {
    expect(formatMessageWithQuote(null, 'hello')).toBe('hello')
  })
})

describe('extractQuoteFromMessage', () => {
  it('round-trips formatted message', () => {
    const quote = {
      filePath: 'notes/a.md',
      fileName: 'a.md',
      text: 'foo\nbar',
      lineFrom: 3,
      lineTo: 4,
      from: 10,
      to: 20,
    }
    const msg = formatMessageWithQuote(quote, 'question?')
    const { quote: extracted, userText } = extractQuoteFromMessage(msg)
    expect(extracted).toMatchObject({
      fileName: 'a.md',
      text: 'foo\nbar',
      lineFrom: 3,
      lineTo: 4,
    })
    expect(userText).toBe('question?')
  })

  it('handles single-line range label', () => {
    const msg = '> 来源：[[b.md]]（第 7 行）\n> only\n\nask'
    const { quote, userText } = extractQuoteFromMessage(msg)
    expect(quote?.lineFrom).toBe(7)
    expect(quote?.lineTo).toBe(7)
    expect(quote?.text).toBe('only')
    expect(userText).toBe('ask')
  })

  it('returns original text when no quote header', () => {
    expect(extractQuoteFromMessage('plain')).toEqual({
      quote: null,
      userText: 'plain',
    })
  })
})
