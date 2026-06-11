import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { editorMarkdownLanguage } from './markdown-language'
import { tags } from '@lezer/highlight'
import type { Extension } from '@codemirror/state'
import type { ThemeColors } from '../theme/useThemeColors'

export function buildMarkdownHighlightStyle(colors: ThemeColors): HighlightStyle {
  return HighlightStyle.define([
    { tag: tags.content, color: 'var(--editor-body-ink, var(--ink))', fontWeight: '500' },
    { tag: tags.heading1, color: colors.h1, fontWeight: '700', fontSize: '1.6em' },
    { tag: tags.heading2, color: colors.h2, fontWeight: '700', fontSize: '1.4em' },
    { tag: tags.heading3, color: colors.h3, fontWeight: '600', fontSize: '1.2em' },
    { tag: tags.heading4, color: colors.h4, fontWeight: '600', fontSize: '1.1em' },
    { tag: tags.heading5, color: colors.h5, fontWeight: '600' },
    { tag: tags.heading6, color: colors.h6, fontWeight: '600' },
    { tag: tags.strong, color: colors.bold, fontWeight: '700' },
    { tag: tags.emphasis, color: colors.italic, fontStyle: 'italic' },
    { tag: tags.strikethrough, textDecoration: 'line-through', color: 'var(--editor-body-ink, var(--ink))' },
    { tag: tags.link, color: colors.link, textDecoration: 'underline' },
    { tag: tags.url, color: colors.link },
    {
      tag: tags.monospace,
      color: colors.code,
      fontFamily: 'var(--font-editor-mono)',
      fontWeight: '500',
    },
    { tag: tags.quote, color: colors.quote, fontStyle: 'italic' },
    { tag: tags.meta, color: 'var(--editor-meta-ink, var(--editor-body-ink))', fontWeight: '600' },
    { tag: tags.processingInstruction, color: colors.h2, fontWeight: '600' },
    { tag: tags.contentSeparator, color: colors.quote, fontWeight: '600' },
    { tag: tags.separator, color: colors.quote },
    { tag: tags.keyword, color: 'var(--editor-meta-ink, var(--editor-body-ink))', fontWeight: '600' },
    { tag: tags.string, color: colors.code },
    { tag: tags.number, color: colors.h3 },
    { tag: tags.comment, color: colors.quote, fontStyle: 'italic' },
  ])
}

export function getMarkdownHighlightExtension(colors: ThemeColors): Extension {
  return syntaxHighlighting(buildMarkdownHighlightStyle(colors))
}

export function getMarkdownExtensions(colors: ThemeColors): Extension[] {
  return [editorMarkdownLanguage, getMarkdownHighlightExtension(colors)]
}
