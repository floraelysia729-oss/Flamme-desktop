import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { editorMarkdownLanguage } from './markdown-language'
import { tags } from '@lezer/highlight'
import type { Extension } from '@codemirror/state'
import type { ThemeColors } from '../theme/useThemeColors'

export function buildMarkdownHighlightStyle(colors: ThemeColors): HighlightStyle {
  const bodyInk = 'var(--editor-body-ink, var(--ink))'
  const metaInk = 'var(--editor-meta-ink, var(--editor-body-ink))'

  return HighlightStyle.define([
    { tag: tags.content, color: bodyInk, fontWeight: '500' },
    { tag: tags.heading1, color: colors.h1, fontWeight: '700', fontSize: '1.6em' },
    { tag: tags.heading2, color: colors.h2, fontWeight: '700', fontSize: '1.4em' },
    { tag: tags.heading3, color: colors.h3, fontWeight: '600', fontSize: '1.2em' },
    { tag: tags.heading4, color: colors.h4, fontWeight: '600', fontSize: '1.1em' },
    { tag: tags.heading5, color: colors.h5, fontWeight: '600' },
    { tag: tags.heading6, color: colors.h6, fontWeight: '600' },
    { tag: tags.strong, color: colors.bold, fontWeight: '700' },
    { tag: tags.emphasis, color: colors.italic, fontStyle: 'italic' },
    { tag: tags.strikethrough, textDecoration: 'line-through', color: bodyInk },
    { tag: tags.link, color: colors.link, textDecoration: 'underline' },
    { tag: tags.url, color: colors.link },
    {
      tag: tags.monospace,
      color: colors.code,
      fontFamily: 'var(--font-editor-mono)',
      fontWeight: '500',
    },
    { tag: tags.quote, color: colors.quote, fontStyle: 'italic' },
    { tag: tags.meta, color: metaInk, fontWeight: '600' },
    { tag: tags.processingInstruction, color: colors.h2, fontWeight: '600' },
    { tag: tags.contentSeparator, color: colors.quote, fontWeight: '600' },
    { tag: tags.separator, color: colors.quote },

    // 围栏代码块内嵌语言 — IDE 式 token 配色
    {
      tag: [
        tags.keyword,
        tags.modifier,
        tags.controlKeyword,
        tags.definitionKeyword,
        tags.moduleKeyword,
        tags.operatorKeyword,
      ],
      color: colors.h3,
      fontWeight: '600',
    },
    {
      tag: [tags.operator, tags.punctuation, tags.bracket, tags.separator],
      color: metaInk,
    },
    {
      tag: [
        tags.string,
        tags.character,
        tags.docString,
        tags.attributeValue,
        tags.regexp,
      ],
      color: colors.code,
    },
    {
      tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment],
      color: colors.quote,
      fontStyle: 'italic',
    },
    {
      tag: [tags.number, tags.integer, tags.float, tags.bool, tags.null],
      color: colors.h4,
    },
    {
      tag: [tags.typeName, tags.className, tags.tagName, tags.namespace],
      color: colors.h2,
      fontWeight: '600',
    },
    {
      tag: [tags.variableName, tags.propertyName, tags.attributeName, tags.labelName],
      color: bodyInk,
    },
    {
      tag: tags.definition(tags.variableName),
      color: colors.h5,
      fontWeight: '600',
    },
    { tag: tags.invalid, color: 'var(--danger)' },
  ])
}

export function getMarkdownHighlightExtension(colors: ThemeColors): Extension {
  return syntaxHighlighting(buildMarkdownHighlightStyle(colors))
}

export function getMarkdownExtensions(colors: ThemeColors): Extension[] {
  return [editorMarkdownLanguage, getMarkdownHighlightExtension(colors)]
}
