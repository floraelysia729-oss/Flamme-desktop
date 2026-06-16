/** 整行 HTML 块（如 <table>...</table>），单行 replace 不跨换行 */

import { sanitizeHtmlSnippet } from '../shared/sanitizeHtml'

export { sanitizeHtmlSnippet }

export interface HtmlBlockRange {
  from: number
  to: number
  html: string
}

const WHOLE_LINE_TAGS = new Set([
  'table',
  'thead',
  'tbody',
  'tr',
  'div',
  'section',
  'article',
  'ul',
  'ol',
  'blockquote',
  'p',
  'pre',
  'details',
  'summary',
])

export function scanHtmlLineBlocks(doc: string): HtmlBlockRange[] {
  const out: HtmlBlockRange[] = []
  let offset = 0

  for (const line of doc.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
      const tag = /^<([a-z][\w-]*)/i.exec(trimmed)?.[1]?.toLowerCase()
      if (tag && WHOLE_LINE_TAGS.has(tag)) {
        const start = offset + line.indexOf(trimmed)
        out.push({ from: start, to: start + trimmed.length, html: trimmed })
      }
    }
    offset += line.length + 1
  }

  return out
}
