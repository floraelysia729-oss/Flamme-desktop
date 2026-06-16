import { EditorView, lineNumbers, highlightActiveLine, keymap } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, historyKeymap, history } from '@codemirror/commands'
import type { ThemeColors } from '../theme/useThemeColors'
import { getEditorTheme } from './theme'
import { getMarkdownHighlightExtension } from './highlight'
import { editorMarkdownLanguage } from './markdown-language'
import { getMarkdownKeymaps } from './keymaps'
import { frontmatterPreviewPlugin } from './frontmatter-preview'
import { livePreview } from './live-preview'
import { wikilinkPlugin, wikilinkClickHandler } from './wikilinks'
import { wikilinkHoverPlugin } from './wikilink-tooltip'
import { blockStylePlugin } from './block-styles'
import { htmlPreviewPlugin } from './html-preview'
import { mathPreviewPlugin } from './math-preview'
import { tablePreviewPlugin } from './table-preview'
import { anchorLinkPlugin, anchorClickHandler } from './anchor-nav'
import { editorScrollHandler, editorSelectionScrollHandler } from './editorScrollHandler'
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
    editorMarkdownLanguage,
    editorThemeCompartment.of(getEditorTheme(colors)),
    highlightCompartment.of(getMarkdownHighlightExtension(colors)),
    frontmatterPreviewPlugin,
    livePreview,
    mathPreviewPlugin,
    htmlPreviewPlugin,
    tablePreviewPlugin,
    anchorLinkPlugin,
    wikilinkPlugin,
    wikilinkHoverPlugin,
    wikilinkClickHandler,
    anchorClickHandler,
    editorScrollHandler,
    editorSelectionScrollHandler,
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
