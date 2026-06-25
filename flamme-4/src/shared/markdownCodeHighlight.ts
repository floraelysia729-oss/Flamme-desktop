import hljs from 'highlight.js/lib/common'
import { escapeAttr } from './markdownEscape'

/** 将源码高亮为 HTML 片段（含 hljs span） */
export function highlightCodeSource(code: string, lang?: string): string {
  const trimmedLang = lang?.trim().toLowerCase() ?? ''
  if (trimmedLang && hljs.getLanguage(trimmedLang)) {
    return hljs.highlight(code, { language: trimmedLang }).value
  }
  return hljs.highlightAuto(code).value
}

export interface CodeBlockHtmlOptions {
  /** 外层容器 class，默认 md-code-block */
  wrapClass?: string
}

/** 围栏代码块 → 带 hljs 高亮的 <pre><code> HTML */
export function renderHighlightedCodeBlock(
  code: string,
  lang?: string,
  options: CodeBlockHtmlOptions = {},
): string {
  const wrapClass = options.wrapClass ?? 'md-code-block'
  const trimmedLang = lang?.trim().toLowerCase() ?? ''
  const langClass = trimmedLang ? ` language-${escapeAttr(trimmedLang)}` : ''
  const highlighted = highlightCodeSource(code, trimmedLang || undefined)
  return `<pre class="${wrapClass}"><code class="hljs${langClass}">${highlighted}</code></pre>`
}

/** CM6 编辑器围栏代码 Widget 预览 HTML */
export function renderEditorCodeBlockPreview(code: string, lang?: string): string {
  const trimmedLang = lang?.trim().toLowerCase() ?? ''
  const langClass = trimmedLang ? ` language-${escapeAttr(trimmedLang)}` : ''
  const highlighted = highlightCodeSource(code, trimmedLang || undefined)
  return `<div class="cm-code-block-preview"><pre><code class="hljs${langClass}">${highlighted}</code></pre></div>`
}
