import type { KeyBinding } from '@codemirror/view'
import { EditorSelection } from '@codemirror/state'

/** 在选区前后包裹标记符号 */
function wrapSelection(view: any, before: string, after: string): boolean {
  const { state } = view
  const sel = state.selection.main

  // 如果没有选区，尝试选中当前单词
  let from = sel.from, to = sel.to
  if (from === to) {
    const line = state.doc.lineAt(from)
    const lineText = line.text
    const pos = from - line.from
    let start = pos, end = pos
    while (start > 0 && /\w/.test(lineText[start - 1])) start--
    while (end < lineText.length && /\w/.test(lineText[end])) end++
    if (start === end) {
      // 光标在非单词位置，直接插入空标记并将光标放在中间
      view.dispatch({
        changes: { from, insert: before + after },
        selection: EditorSelection.cursor(from + before.length),
      })
      return true
    }
    from = line.from + start
    to = line.from + end
  }

  view.dispatch({
    changes: { from, to, insert: before + state.sliceDoc(from, to) + after },
    selection: EditorSelection.range(from + before.length, to + before.length),
  })
  return true
}

/** 切换行首前缀（用于标题和列表） */
function toggleLinePrefix(view: any, prefix: string): boolean {
  const { state } = view
  const sel = state.selection.main
  const line = state.doc.lineAt(sel.from)
  const lineText = line.text

  // 检查当前行是否已有该前缀
  if (lineText.startsWith(prefix + ' ')) {
    // 移除前缀
    const removeLen = prefix.length + 1
    view.dispatch({
      changes: { from: line.from, to: line.from + removeLen, insert: '' },
      selection: EditorSelection.cursor(Math.max(line.from, sel.from - removeLen)),
    })
    return true
  }

  // 如果有其他级别的标题前缀，先移除
  let removeLen = 0
  const headingMatch = lineText.match(/^(#{1,6})\s/)
  if (headingMatch) {
    removeLen = headingMatch[1].length + 1
  } else if (lineText.startsWith('- ')) {
    removeLen = 2
  }

  const insert = prefix + ' '
  const from = line.from
  view.dispatch({
    changes: removeLen > 0
      ? { from, to: from + removeLen, insert }
      : { from, insert },
    selection: EditorSelection.cursor(from + insert.length + (sel.from - line.from - removeLen)),
  })
  return true
}

/** 代码块：在选区前后插入 ``` */
function insertCodeBlock(view: any): boolean {
  const { state } = view
  const sel = state.selection.main
  const text = state.sliceDoc(sel.from, sel.to)
  const insert = '```\n' + text + '\n```'

  if (sel.from === sel.to) {
    // 无选区，插入空代码块并将光标放在中间
    view.dispatch({
      changes: { from: sel.from, insert: '```\n\n```' },
      selection: EditorSelection.cursor(sel.from + 4),
    })
  } else {
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert },
      selection: EditorSelection.range(sel.from + 4, sel.from + 4 + text.length),
    })
  }
  return true
}

export function getMarkdownKeymaps(): KeyBinding[] {
  return [
    { key: 'Mod-b', run: (v) => wrapSelection(v, '**', '**') },
    { key: 'Mod-i', run: (v) => wrapSelection(v, '*', '*') },
    { key: 'Mod-`', run: (v) => wrapSelection(v, '`', '`') },
    { key: 'Mod-1', run: (v) => toggleLinePrefix(v, '#') },
    { key: 'Mod-2', run: (v) => toggleLinePrefix(v, '##') },
    { key: 'Mod-3', run: (v) => toggleLinePrefix(v, '###') },
    { key: 'Mod-Shift-k', run: insertCodeBlock },
    { key: 'Mod-Shift-l', run: (v) => toggleLinePrefix(v, '-') },
  ]
}
