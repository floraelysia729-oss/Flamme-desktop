import { EditorView } from '@codemirror/view'
import type { ThemeColors } from '../theme/useThemeColors'

export function getEditorTheme(colors: ThemeColors) {
  return EditorView.theme({
    '&': {
      fontSize: 'var(--font-editor-size, 17px)',
      fontFamily: 'var(--font-editor)',
      fontWeight: '500',
      backgroundColor: 'transparent',
      color: 'var(--editor-body-ink, var(--ink))',
      height: '100%',
    },
    '.cm-scroller': {
      lineHeight: '1.65',
      overflowY: 'scroll',
      scrollbarGutter: 'stable',
    },
    '.cm-content': {
      padding: '18px 36px 18px 14px',
      caretColor: 'var(--editor-body-ink, var(--ink))',
      fontWeight: '500',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--cm-gutter-bg)',
      color: 'var(--ink-muted-on-glass, var(--ink-muted))',
      borderRight: '1px solid var(--cm-gutter-border)',
      paddingLeft: '6px',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      paddingRight: '12px',
      minWidth: '36px',
      fontSize: '0.9em',
      textAlign: 'right',
    },
    '.cm-activeLine': {
      backgroundColor: 'var(--cm-active-line-bg)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'var(--cm-active-line-gutter-bg)',
    },
    '&.cm-focused': {
      outline: 'none',
    },
    '.cm-cursor': {
      borderLeftColor: 'var(--accent)',
      borderLeftWidth: '2px',
    },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      backgroundColor: 'var(--cm-selection-bg)',
    },
  })
}
