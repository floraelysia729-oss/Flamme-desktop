/**
 * YAML frontmatter Live Preview — 非编辑区折叠为属性卡片
 */
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  WidgetType,
  type ViewUpdate,
} from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'
import {
  parseFrontmatterFields,
  scanFrontmatter,
  type FrontmatterField,
} from './frontmatter-ranges'
import { widgetPreviewUpdate } from './preview-update'

function frontmatterLines(view: EditorView, from: number, to: number) {
  const lines: ReturnType<EditorView['state']['doc']['lineAt']>[] = []
  let pos = from
  while (pos < to) {
    const line = view.state.doc.lineAt(pos)
    if (line.from >= to) break
    lines.push(line)
    if (line.to >= to) break
    pos = line.to + 1
  }
  return lines
}

class FrontmatterWidget extends WidgetType {
  constructor(readonly fields: FrontmatterField[]) {
    super()
  }

  eq(other: WidgetType) {
    return (
      other instanceof FrontmatterWidget &&
      other.fields.length === this.fields.length &&
      other.fields.every(
        (f, i) => f.key === this.fields[i].key && f.value === this.fields[i].value,
      )
    )
  }

  toDOM() {
    const wrap = document.createElement('div')
    wrap.className = 'cm-frontmatter-preview'
    wrap.setAttribute('role', 'group')
    wrap.setAttribute('aria-label', '文档属性')

    if (this.fields.length === 0) {
      const empty = document.createElement('span')
      empty.className = 'cm-frontmatter-preview__empty'
      empty.textContent = '（无属性）'
      wrap.appendChild(empty)
      return wrap
    }

    for (const { key, value } of this.fields) {
      const row = document.createElement('div')
      row.className = 'cm-frontmatter-preview__row'

      const keyEl = document.createElement('span')
      keyEl.className = 'cm-frontmatter-preview__key'
      keyEl.textContent = key

      const valEl = document.createElement('span')
      valEl.className = 'cm-frontmatter-preview__value'
      valEl.textContent = value

      row.appendChild(keyEl)
      row.appendChild(valEl)
      wrap.appendChild(row)
    }
    return wrap
  }

  ignoreEvent() {
    return true
  }
}

function pushCollapsedFrontmatter(
  view: EditorView,
  pending: { from: number; to: number; deco: Decoration }[],
  from: number,
  to: number,
  fields: FrontmatterField[],
) {
  const firstLine = view.state.doc.lineAt(from)
  pending.push({
    from: firstLine.to,
    to: firstLine.to,
    deco: Decoration.widget({
      widget: new FrontmatterWidget(fields),
      side: 1,
    }),
  })

  for (const line of frontmatterLines(view, from, to)) {
    pending.push({
      from: line.from,
      to: line.from,
      deco: Decoration.line({ class: 'cm-frontmatter-src-hidden' }),
    })
  }
}

function pushEditingFrontmatter(
  pending: { from: number; to: number; deco: Decoration }[],
  view: EditorView,
  from: number,
  to: number,
) {
  for (const line of frontmatterLines(view, from, to)) {
    pending.push({
      from: line.from,
      to: line.from,
      deco: Decoration.line({ class: 'cm-frontmatter-editing' }),
    })
  }
}

function buildFrontmatterDecorations(view: EditorView): DecorationSet {
  const head = view.state.selection.main.head
  const doc = view.state.doc.toString()
  const fm = scanFrontmatter(doc)
  const pending: { from: number; to: number; deco: Decoration }[] = []

  if (fm) {
    const editing = head >= fm.from && head < fm.to
    if (!editing) {
      const fields = parseFrontmatterFields(fm.yamlText)
      pushCollapsedFrontmatter(view, pending, fm.from, fm.to, fields)
    } else {
      pushEditingFrontmatter(pending, view, fm.from, fm.to)
    }
  }

  pending.sort((a, b) => a.from - b.from || a.to - b.to)

  const builder = new RangeSetBuilder<Decoration>()
  let lastTo = 0
  for (const { from, to, deco } of pending) {
    if (from < lastTo) continue
    builder.add(from, to, deco)
    lastTo = to
  }
  return builder.finish()
}

export const frontmatterPreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildFrontmatterDecorations(view)
    }

    update(update: ViewUpdate) {
      widgetPreviewUpdate(update, this, buildFrontmatterDecorations)
    }
  },
  { decorations: (v) => v.decorations },
)
