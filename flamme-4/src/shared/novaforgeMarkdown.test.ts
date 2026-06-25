import { describe, expect, it } from 'vitest'
import { scanGfmTableBlocks, isGfmTableStart } from '../editor/table-ranges'
import { clearGfmTableHtmlCache, gfmTableMarkdownToHtml } from './markdownTableHtml'
import { resolveAnchorPos, scanInternalMdLinks } from './markdownAnchors'
import { renderChatMarkdown } from '../chat/renderMarkdown'
import { renderMarkdown } from './renderMarkdown'
import { highlightCodeSource } from './markdownCodeHighlight'

const NOVA_TABLE = `| 题型 | 分值 | 考查重点 |
|------|:----:|----------|
| 选择题 | 30 分 | 概念辨析、范围判断、细节记忆 |`

describe('table-ranges', () => {
  it('detects GFM table blocks', () => {
    expect(isGfmTableStart('| a | b |', '|---|---|')).toBe(true)
    const blocks = scanGfmTableBlocks(`intro\n\n${NOVA_TABLE}\n\nafter`)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].markdown).toContain('选择题')
  })
})

describe('markdownTableHtml', () => {
  it('renders NovaForge sample table to HTML', () => {
    clearGfmTableHtmlCache()
    const html = gfmTableMarkdownToHtml(NOVA_TABLE)
    expect(html).toContain('<table')
    expect(html).toContain('题型')
    expect(html).toContain('选择题')
    expect(gfmTableMarkdownToHtml(NOVA_TABLE)).toBe(html)
  })
})

describe('markdownAnchors', () => {
  it('resolves html anchor ids', () => {
    const doc = '<a id="overview"></a>\n## 一、考试概览'
    expect(resolveAnchorPos(doc, 'overview')).toBe(0)
    const links = scanInternalMdLinks('- [一、考试概览](#overview)')
    expect(links[0]?.anchorId).toBe('overview')
  })
})

describe('renderChatMarkdown', () => {
  it('renders pipe tables and internal anchor links', () => {
    const md = `${NOVA_TABLE}\n\n<a id="overview"></a>\n[一、考试概览](#overview)`
    const html = renderChatMarkdown(md)
    expect(html).toContain('<table')
    expect(html).toContain('chat-md-anchor')
    expect(html).toContain('data-md-anchor="overview"')
    expect(html).not.toContain('data-doc-href="overview"')
  })

  it('renders fenced code blocks with hljs highlighting', () => {
    const md = '```javascript\nconst x = 1\nconsole.log(x)\n```'
    const html = renderChatMarkdown(md)
    expect(html).toContain('md-code-block')
    expect(html).toContain('hljs')
    expect(html).toContain('language-javascript')
    expect(html).toContain('console')
    expect(highlightCodeSource('const x = 1', 'javascript')).toContain('hljs-')
  })
})

describe('renderMarkdown', () => {
  it('highlights code blocks globally outside chat link mode', () => {
    const html = renderMarkdown('```python\nprint("hi")\n```')
    expect(html).toContain('md-code-block')
    expect(html).toContain('language-python')
    expect(html).not.toContain('chat-doc-link')
  })
})
