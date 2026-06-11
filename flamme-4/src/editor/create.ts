import { EditorView, lineNumbers, highlightActiveLine, keymap } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, historyKeymap, history } from '@codemirror/commands'
import type { ThemeColors } from '../theme/useThemeColors'
import { getEditorTheme } from './theme'
import { getMarkdownHighlightExtension } from './highlight'
import { markdown } from '@codemirror/lang-markdown'
import { getMarkdownKeymaps } from './keymaps'
import { livePreview } from './live-preview'
import { wikilinkPlugin, wikilinkClickHandler } from './wikilinks'
import { wikilinkHoverPlugin } from './wikilink-tooltip'
import { blockStylePlugin } from './block-styles'
import { htmlPreviewPlugin } from './html-preview'
import { mathPreviewPlugin } from './math-preview'
import { editorThemeCompartment, highlightCompartment } from './extensions'

export function createEditor(
  parent: HTMLElement,
  content: string,
  colors: ThemeColors,
): EditorView {
  const extensions = [
    lineNumbers(),
    highlightActiveLine(),
    EditorView.lineWrapping,
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap, ...getMarkdownKeymaps()]),
    markdown(),
    editorThemeCompartment.of(getEditorTheme(colors)),
    highlightCompartment.of(getMarkdownHighlightExtension(colors)),
    livePreview,
    mathPreviewPlugin,
    htmlPreviewPlugin,
    wikilinkPlugin,
    wikilinkHoverPlugin,
    wikilinkClickHandler,
    blockStylePlugin,
  ]

  const state = EditorState.create({ doc: content, extensions })
  return new EditorView({ state, parent })
}

export function reconfigureEditorTheme(view: EditorView, colors: ThemeColors) {
  view.dispatch({
    effects: [
      editorThemeCompartment.reconfigure(getEditorTheme(colors)),
      highlightCompartment.reconfigure(getMarkdownHighlightExtension(colors)),
    ],
  })
}
