import katex from 'katex'
import { Marked } from 'marked'
import { renderHighlightedCodeBlock } from './markdownCodeHighlight'
import { escapeAttr, escapeHtml } from './markdownEscape'

const CODE_PLACEHOLDER = '\x00CODEBLOCK'

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

export function protectCodeBlocks(text: string): { text: string; blocks: string[] } {
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

export function restoreCodeBlocks(text: string, blocks: string[]): string {
  return text.replace(
    new RegExp(`${CODE_PLACEHOLDER}(\\d+)${CODE_PLACEHOLDER}`, 'g'),
    (_, idx) => blocks[parseInt(idx, 10)] ?? '',
  )
}

function renderMath(text: string): string {
  let out = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, math: string) => {
    const rendered = renderKaTeX(math.trim(), true)
    return `<div class="md-math-block">${rendered}</div>`
  })

  out = out.replace(/\$([^\$\n]+?)\$/g, (_, math: string) => {
    const rendered = renderKaTeX(math.trim(), false)
    return `<span class="md-math-inline">${rendered}</span>`
  })

  return out
}

export type MarkdownLinkMode = 'default' | 'chat'

export interface RenderMarkdownOptions {
  /** 流式期间跳过 KaTeX（最贵的一步），公式保留为原文 */
  skipMath?: boolean
  /** chat：对话区链接样式（vault 相对路径、锚点） */
  linkMode?: MarkdownLinkMode
}

function createMarked(linkMode: MarkdownLinkMode): Marked {
  return new Marked({
    gfm: true,
    breaks: true,
    renderer: {
      code({ text, lang }) {
        return renderHighlightedCodeBlock(text, lang ?? undefined)
      },
      link({ href, text }) {
        const label = typeof text === 'string' ? text : ''
        const url = (href ?? '').trim()
        if (!url) return label

        if (/^https?:\/\//i.test(url)) {
          const linkClass = linkMode === 'chat' ? 'chat-md-external' : 'md-external'
          return `<a class="${linkClass}" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
        }

        if (url.startsWith('#')) {
          const id = url.slice(1).trim()
          if (linkMode === 'chat') {
            return `<a class="chat-md-anchor" role="link" href="#" data-md-anchor="${escapeAttr(id)}">${escapeHtml(label)}</a>`
          }
          return `<a class="md-anchor" href="#${escapeAttr(id)}">${escapeHtml(label)}</a>`
        }

        if (linkMode === 'chat') {
          const safeHref = escapeAttr(url.replace(/^\//, ''))
          return `<a class="chat-doc-link" role="link" href="#" data-doc-href="${safeHref}">${escapeHtml(label)}</a>`
        }

        return `<a class="md-link" href="${escapeAttr(url)}">${escapeHtml(label)}</a>`
      },
    },
  })
}

const defaultMarked = createMarked('default')
const chatMarked = createMarked('chat')

/**
 * 全局 Markdown → HTML（KaTeX、hljs 代码块、GFM 表格等）。
 * 对话区在预处理 wikilink 后传入 `linkMode: 'chat'`。
 */
export function renderMarkdown(
  text: string,
  options: RenderMarkdownOptions = {},
): string {
  if (!text.trim()) return ''

  const linkMode = options.linkMode ?? 'default'
  const marked = linkMode === 'chat' ? chatMarked : defaultMarked

  const { text: protectedText, blocks } = protectCodeBlocks(text)
  const withMath = options.skipMath ? protectedText : renderMath(protectedText)
  const restored = restoreCodeBlocks(withMath, blocks)
  const raw = marked.parse(restored)
  return typeof raw === 'string' ? raw : ''
}
