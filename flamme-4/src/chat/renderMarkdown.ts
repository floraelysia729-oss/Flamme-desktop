import katex from 'katex'
import { Marked } from 'marked'
import { extractSuggestionQuestions } from './markdown'

const CODE_PLACEHOLDER = '\x00CODEBLOCK'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;')
}

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

function renderKaTeX(math: string, displayMode: boolean): string {
  try {
    return katex.renderToString(math, {
      displayMode,
      throwOnError: false,
      strict: false,
    })
  } catch {
    return `<code class="math-error">${escapeHtml(math)}</code>`
  }
}

function protectCodeBlocks(text: string): { text: string; blocks: string[] } {
  const blocks: string[] = []
  let protectedText = text

  protectedText = protectedText.replace(/```[\s\S]*?```/g, (match) => {
    const idx = blocks.length
    blocks.push(match)
    return `${CODE_PLACEHOLDER}${idx}${CODE_PLACEHOLDER}`
  })

  protectedText = protectedText.replace(/`([^`\n]+)`/g, (match) => {
    const idx = blocks.length
    blocks.push(match)
    return `${CODE_PLACEHOLDER}${idx}${CODE_PLACEHOLDER}`
  })

  return { text: protectedText, blocks }
}

function restoreCodeBlocks(text: string, blocks: string[]): string {
  return text.replace(
    new RegExp(`${CODE_PLACEHOLDER}(\\d+)${CODE_PLACEHOLDER}`, 'g'),
    (_, idx) => blocks[parseInt(idx, 10)] ?? '',
  )
}

function renderMath(text: string): string {
  let out = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, math: string) => {
    const rendered = renderKaTeX(math.trim(), true)
    return `<div class="chat-math-block">${rendered}</div>`
  })

  out = out.replace(/\$([^\$\n]+?)\$/g, (_, math: string) => {
    const rendered = renderKaTeX(math.trim(), false)
    return `<span class="chat-math-inline">${rendered}</span>`
  })

  return out
}

const marked = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    link({ href, text }) {
      const label = typeof text === 'string' ? text : ''
      const url = (href ?? '').trim()
      if (!url) return label

      if (/^https?:\/\//i.test(url)) {
        return `<a class="chat-md-external" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
      }

      const safeHref = escapeAttr(url.replace(/^\//, ''))
      return `<a class="chat-doc-link" role="link" href="#" data-doc-href="${safeHref}">${escapeHtml(label)}</a>`
    },
  },
})

interface RenderChatMarkdownOptions {
  /** 流式期间跳过 KaTeX（最贵的一步），公式保留为原文，输出结束后再完整渲染 */
  skipMath?: boolean
}

/** 助手消息 Markdown → HTML（含 KaTeX、wikilink、vault 相对链接） */
export function renderChatMarkdown(
  text: string,
  options: RenderChatMarkdownOptions = {},
): string {
  if (!text.trim()) return ''

  const { cleanText } = extractSuggestionQuestions(text)
  const withWikilinks = preprocessWikilinks(cleanText)
  const { text: protectedText, blocks } = protectCodeBlocks(withWikilinks)
  const withMath = options.skipMath ? protectedText : renderMath(protectedText)
  const restored = restoreCodeBlocks(withMath, blocks)
  const raw = marked.parse(restored)
  return typeof raw === 'string' ? raw : ''
}
