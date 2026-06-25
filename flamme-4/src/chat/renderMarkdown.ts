import { renderMarkdown } from '../shared/renderMarkdown'
import { escapeAttr, escapeHtml } from '../shared/markdownEscape'
import { extractSuggestionQuestions } from './markdown'

function docLinkHtml(target: string, label: string): string {
  const safeTarget = escapeAttr(target.trim())
  const safeLabel = escapeHtml(label.trim() || target.trim())
  return `<a class="chat-doc-link" role="link" href="#" data-doc-target="${safeTarget}">${safeLabel}</a>`
}

/** [[wikilink]] → 可点击文档链接（解析在 ChatMarkdown 点击时） */
function preprocessWikilinks(text: string): string {
  return text.replace(/\[\[([^\]]+)\]\]/g, (_, raw: string) => {
    const title = raw.trim()
    return docLinkHtml(title, title)
  })
}

interface RenderChatMarkdownOptions {
  /** 流式期间跳过 KaTeX（最贵的一步），公式保留为原文，输出结束后再完整渲染 */
  skipMath?: boolean
}

/** 助手消息 Markdown → HTML（含 KaTeX、wikilink、vault 相对链接、hljs 代码块） */
export function renderChatMarkdown(
  text: string,
  options: RenderChatMarkdownOptions = {},
): string {
  if (!text.trim()) return ''

  const { cleanText } = extractSuggestionQuestions(text)
  const withWikilinks = preprocessWikilinks(cleanText)
  return renderMarkdown(withWikilinks, {
    skipMath: options.skipMath,
    linkMode: 'chat',
  })
}
