import type { EditorState } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'

export interface FencedCodeRange {
  from: number
  to: number
  lang: string
  code: string
}

export function scanFencedCodeBlocks(state: EditorState): FencedCodeRange[] {
  const doc = state.doc.toString()
  const out: FencedCodeRange[] = []

  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== 'FencedCode') return
      let lang = ''
      let code = ''
      const c = node.node.cursor()
      if (c.firstChild()) {
        do {
          if (c.name === 'CodeInfo') lang = doc.slice(c.from, c.to).trim()
          if (c.name === 'CodeText') code = doc.slice(c.from, c.to)
        } while (c.nextSibling())
      }
      out.push({ from: node.from, to: node.to, lang, code })
    },
  })

  return out
}

export function fencedCodeAt(
  state: EditorState,
  pos: number,
): FencedCodeRange | null {
  for (const block of scanFencedCodeBlocks(state)) {
    if (pos >= block.from && pos <= block.to) return block
  }
  return null
}

export function isFencedCodePreview(
  state: EditorState,
  from: number,
  to: number,
  cursor: number,
): boolean {
  return !(cursor >= from && cursor <= to)
}
