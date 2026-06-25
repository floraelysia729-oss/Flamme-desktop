import type { Text } from '@codemirror/state'
import type { EditorQuote } from './editorQuoteStore'

const MAX_QUOTE_CHARS = 8000

const QUOTE_HEADER_RE =
  /^> 来源：\[\[([^\]]+)\]\]（第 (\d+)(?:–(\d+))? 行）\n((?:> .*(?:\n|$))*)/

export function selectionLineRange(
  doc: Text,
  from: number,
  to: number,
): { lineFrom: number; lineTo: number } {
  const start = Math.min(from, to)
  const end = Math.max(from, to)
  const lineFrom = doc.lineAt(start).number
  const lineTo = doc.lineAt(Math.max(start, end - 1)).number
  return { lineFrom, lineTo }
}

export function buildQuoteFromSelection(
  filePath: string,
  fileName: string,
  doc: Text,
  from: number,
  to: number,
): EditorQuote | null {
  const start = Math.min(from, to)
  const end = Math.max(from, to)
  if (start === end) return null

  let text = doc.sliceString(start, end)
  if (text.length > MAX_QUOTE_CHARS) {
    text = text.slice(0, MAX_QUOTE_CHARS) + '…'
  }

  const { lineFrom, lineTo } = selectionLineRange(doc, from, to)
  return {
    filePath: filePath.replace(/\\/g, '/'),
    fileName,
    text,
    lineFrom,
    lineTo,
    from: start,
    to: end,
  }
}

export function formatMessageWithQuote(
  quote: EditorQuote | null,
  userText: string,
): string {
  const trimmed = userText.trim()
  if (!quote) return trimmed

  const lineLabel =
    quote.lineFrom === quote.lineTo
      ? `第 ${quote.lineFrom} 行`
      : `第 ${quote.lineFrom}–${quote.lineTo} 行`

  const quotedLines = quote.text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')

  const block = `> 来源：[[${quote.fileName}]]（${lineLabel}）\n${quotedLines}`
  return trimmed ? `${block}\n\n${trimmed}` : block
}

export function extractQuoteFromMessage(text: string): {
  quote: EditorQuote | null
  userText: string
} {
  const match = text.match(QUOTE_HEADER_RE)
  if (!match) {
    return { quote: null, userText: text }
  }

  const [, fileName, lineFromStr, lineToStr, bodyBlock] = match
  const lineFrom = Number(lineFromStr)
  const lineTo = lineToStr ? Number(lineToStr) : lineFrom

  const textLines = bodyBlock
    .split('\n')
    .filter((line) => line.startsWith('> '))
    .map((line) => line.slice(2))

  const quoteText = textLines.join('\n').replace(/\n$/, '')
  const rest = text.slice(match[0].length).replace(/^\n+/, '')

  return {
    quote: {
      filePath: '',
      fileName,
      text: quoteText,
      lineFrom,
      lineTo,
      from: 0,
      to: 0,
    },
    userText: rest,
  }
}
