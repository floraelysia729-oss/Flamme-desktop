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
      overflow: 'auto',
    },
    '.cm-content': {
      padding: '18px 36px 18px 14px',
      caretColor: 'var(--editor-body-ink, var(--ink))',
      fontWeight: '500',
    },
    '.cm-gutters': {
      backgroundColor: 'rgba(0,0,0,0.15)',
      color: 'var(--ink-muted-on-glass, var(--ink-muted))',
      borderRight: '1px solid rgba(255,255,255,0.08)',
      paddingLeft: '6px',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      paddingRight: '12px',
      minWidth: '36px',
      fontSize: '0.9em',
      textAlign: 'right',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(255,255,255,0.04)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(255,255,255,0.06)',
    },
    '&.cm-focused': {
      outline: 'none',
    },
    '.cm-cursor': {
      borderLeftColor: 'var(--accent)',
      borderLeftWidth: '2px',
    },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      backgroundColor: 'rgba(255,255,255,0.08)',
    },
  })
}
