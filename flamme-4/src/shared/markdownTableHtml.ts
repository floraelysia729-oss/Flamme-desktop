import { Marked } from 'marked'
import { sanitizeHtmlSnippet } from '../shared/sanitizeHtml'

const tableMarked = new Marked({ gfm: true, breaks: true })

const htmlCache = new Map<string, string>()

function hashString(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

function extractTableHtml(raw: string): string {
  const match = raw.match(/<table[\s\S]*?<\/table>/i)
  return match ? sanitizeHtmlSnippet(match[0]) : ''
}

/** 将单个 GFM 表格块 Markdown 转为 HTML（带内容 hash 缓存） */
export function gfmTableMarkdownToHtml(markdown: string): string {
  const trimmed = markdown.trim()
  if (!trimmed) return ''
  const key = hashString(trimmed)
  const cached = htmlCache.get(key)
  if (cached !== undefined) return cached

  const parsed = tableMarked.parse(trimmed)
  const html = typeof parsed === 'string' ? extractTableHtml(parsed) : ''
  htmlCache.set(key, html)
  return html
}

/** 测试用：清空缓存 */
export function clearGfmTableHtmlCache(): void {
  htmlCache.clear()
}
