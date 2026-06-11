import {
  darkUiColors,
  lightUiColors,
  lightVisualThemeColorPresets,
  visualThemeColorPresets,
} from './presets'
import type { ThemeColors } from './useThemeColors'

const CUSTOMIZED_KEY = 'flamme-editor-colors-customized'
const CONFIRM_PREF_KEY = 'flamme-editor-theme-confirm-pref'

/** 换主题时编辑器配色确认框：ask=弹窗，defaults=自动用主题默认，keep=自动保留当前 */
export type ThemeConfirmPreference = 'ask' | 'defaults' | 'keep'

const COLOR_KEYS: (keyof ThemeColors)[] = [
  'background',
  'text',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'bold',
  'italic',
  'code',
  'link',
  'quote',
]

export function colorsEqual(a: ThemeColors, b: ThemeColors): boolean {
  return COLOR_KEYS.every((k) => a[k].toLowerCase() === b[k].toLowerCase())
}

export function getDefaultEditorColors(
  visualThemeId: string,
  colorMode: 'light' | 'dark',
): ThemeColors {
  if (colorMode === 'light') {
    return (
      lightVisualThemeColorPresets[visualThemeId] ??
      lightUiColors
    )
  }
  return visualThemeColorPresets[visualThemeId] ?? darkUiColors
}

export function loadEditorColorsCustomized(): boolean {
  try {
    return localStorage.getItem(CUSTOMIZED_KEY) === '1'
  } catch {
    return false
  }
}

export function saveEditorColorsCustomized(customized: boolean) {
  try {
    localStorage.setItem(CUSTOMIZED_KEY, customized ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function loadThemeConfirmPreference(): ThemeConfirmPreference {
  try {
    const v = localStorage.getItem(CONFIRM_PREF_KEY)
    if (v === 'defaults' || v === 'keep') return v
  } catch {
    /* ignore */
  }
  return 'ask'
}

export function saveThemeConfirmPreference(pref: ThemeConfirmPreference) {
  try {
    if (pref === 'ask') localStorage.removeItem(CONFIRM_PREF_KEY)
    else localStorage.setItem(CONFIRM_PREF_KEY, pref)
  } catch {
    /* ignore */
  }
}
