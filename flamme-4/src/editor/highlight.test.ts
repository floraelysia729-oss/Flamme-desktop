import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import { markdown } from '@codemirror/lang-markdown'
import { javascript } from '@codemirror/lang-javascript'
import { LanguageDescription } from '@codemirror/language'
import { buildMarkdownHighlightStyle, getMarkdownHighlightExtension } from './highlight'

const testColors = {
  background: '#1e1e2e',
  text: '#cdd6f4',
  h1: '#f5c2e7',
  h2: '#cba6f7',
  h3: '#89b4fa',
  h4: '#94e2d5',
  h5: '#a6e3a1',
  h6: '#f9e2af',
  bold: '#fab387',
  italic: '#f5e0dc',
  code: '#a6e3a1',
  link: '#89b4fa',
  quote: '#6c7086',
}

describe('fenced code syntax highlighting', () => {
  it('builds highlight style without throwing', () => {
    const style = buildMarkdownHighlightStyle(testColors)
    expect(style).toBeTruthy()
  })

  it('parses javascript fenced blocks with nested language nodes', async () => {
    const jsLang = LanguageDescription.of({
      name: 'JavaScript',
      alias: ['javascript', 'js'],
      load: async () => javascript(),
    })
    await jsLang.load()

    const md = markdown({ codeLanguages: [jsLang] })
    const doc = '```javascript\nconst x = "hi" // comment\n```\n'
    const state = EditorState.create({
      doc,
      extensions: [md, getMarkdownHighlightExtension(testColors)],
    })

    await new Promise((r) => setTimeout(r, 0))

    const nodeNames = new Set<string>()
    syntaxTree(state).iterate({
      enter(node) {
        nodeNames.add(node.name)
      },
    })

    expect(nodeNames.has('FencedCode')).toBe(true)
    const names = [...nodeNames].sort()
    expect(
      names.some((n) =>
        ['Program', 'Script', 'VariableDeclaration', 'String', 'LineComment'].includes(n),
      ),
      `expected nested JS nodes, got: ${names.join(', ')}`,
    ).toBe(true)
  })
})
