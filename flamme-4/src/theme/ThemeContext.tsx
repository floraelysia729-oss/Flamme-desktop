import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  autoMapColors,
  clearImagePalette,
  loadImagePalette,
} from '../settings/editorThemeUtils'
import EditorThemeConfirm from './EditorThemeConfirm'
import {
  getDefaultEditorColors,
  loadEditorColorsCustomized,
  loadThemeConfirmPreference,
  saveEditorColorsCustomized,
  saveThemeConfirmPreference,
} from './editorColorDefaults'
import { hexWithAlpha } from './colors'
import { glassClasses } from './glass'
import {
  useThemeColors,
  type ThemeColors,
  type VisualTheme,
} from './useThemeColors'

export { lightUiColors, darkUiColors } from './presets'
export { getDefaultEditorColors } from './editorColorDefaults'

export type ColorMode = 'light' | 'dark'

const VISUAL_THEME_ORDER = ['xilan', 'wushan', 'zhihe'] as const
const COLOR_MODE_KEY = 'flamme-color-mode'

function loadColorMode(): ColorMode {
  try {
    const v = localStorage.getItem(COLOR_MODE_KEY)
    if (v === 'light' || v === 'dark') return v
  } catch {
    /* ignore */
  }
  return 'dark'
}

function applyEditorCssVars(colors: ThemeColors, colorMode: ColorMode) {
  const root = document.documentElement
  root.style.setProperty('--editor-text', colors.text)
  root.style.setProperty('--editor-bg', colors.background)
  root.style.setProperty('--editor-h1', colors.h1)
  root.style.setProperty('--editor-h2', colors.h2)
  root.style.setProperty('--editor-h3', colors.h3)
  root.style.setProperty('--editor-link', colors.link)
  root.style.setProperty('--editor-code', colors.code)
  root.style.setProperty('--editor-quote', colors.quote)
  const glassAlpha = 0.9
  root.style.setProperty(
    '--editor-glass-bg',
    hexWithAlpha(colors.background, glassAlpha),
  )
  if (colorMode === 'light') {
    root.style.setProperty('--glass-bg', hexWithAlpha(colors.background, 0.58))
  } else {
    root.style.removeProperty('--glass-bg')
  }
}

type PendingThemeChange = {
  visualThemeId: string
  colorMode: ColorMode
  themeLabel: string
}

interface ThemeContextValue {
  colors: ThemeColors
  updateColors: (c: ThemeColors) => void
  updateEditorColors: (c: ThemeColors) => void
  visualTheme: string
  visualThemes: VisualTheme[]
  setVisualTheme: (id: string) => void
  requestSetVisualTheme: (id: string) => void
  colorMode: ColorMode
  setColorMode: (mode: ColorMode) => void
  requestSetColorMode: (mode: ColorMode) => void
  toggleColorMode: () => void
  cycleVisualTheme: () => void
  currentThemeName: string
  editorColorsCustomized: boolean
  glass: ReturnType<typeof glassClasses>
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const base = useThemeColors()
  const [colorMode, setColorModeState] = useState<ColorMode>(loadColorMode)
  const [editorColorsCustomized, setEditorColorsCustomized] = useState(
    loadEditorColorsCustomized,
  )
  const [pendingChange, setPendingChange] = useState<PendingThemeChange | null>(
    null,
  )

  const setCustomized = useCallback((value: boolean) => {
    setEditorColorsCustomized(value)
    saveEditorColorsCustomized(value)
  }, [])

  const setColorMode = useCallback((mode: ColorMode) => {
    setColorModeState(mode)
    try {
      localStorage.setItem(COLOR_MODE_KEY, mode)
    } catch {
      /* ignore */
    }
  }, [])

  const applyDefaultEditorColors = useCallback(
    (visualThemeId: string, mode: ColorMode) => {
      base.updateColors(getDefaultEditorColors(visualThemeId, mode))
      setCustomized(false)
    },
    [base, setCustomized],
  )

  const commitVisualThemeOnly = useCallback(
    (id: string) => {
      base.setVisualTheme(id)
    },
    [base],
  )

  const applyVisualThemeWithColors = useCallback(
    (id: string, mode: ColorMode) => {
      base.setVisualTheme(id)
      applyDefaultEditorColors(id, mode)
    },
    [base, applyDefaultEditorColors],
  )

  const finishPending = useCallback(
    (applyDefaults: boolean) => {
      if (!pendingChange) return
      const { visualThemeId, colorMode: mode } = pendingChange
      setPendingChange(null)
      if (applyDefaults) {
        clearImagePalette()
        applyVisualThemeWithColors(visualThemeId, mode)
      } else {
        commitVisualThemeOnly(visualThemeId)
        setColorMode(mode)
      }
    },
    [
      pendingChange,
      applyVisualThemeWithColors,
      commitVisualThemeOnly,
      setColorMode,
    ],
  )

  const finishPendingDontAskAgain = useCallback(() => {
    saveThemeConfirmPreference('defaults')
    finishPending(true)
  }, [finishPending])

  const requestThemeContextChange = useCallback(
    (visualThemeId: string, mode: ColorMode) => {
      const themeName =
        base.visualThemes.find((t) => t.id === visualThemeId)?.name ?? visualThemeId
      const modeLabel = mode === 'light' ? '浅色' : '深色'
      const sameVisual = visualThemeId === base.visualTheme
      const sameMode = mode === colorMode

      if (sameVisual && sameMode) return

      const imagePalette = loadImagePalette()

      // 参考图配色：仅在同一壁纸下切换明暗时重映射，不阻止换主题时的默认配色
      if (sameVisual && !sameMode && imagePalette && editorColorsCustomized) {
        setColorMode(mode)
        base.updateColors(autoMapColors(imagePalette, mode))
        setCustomized(true)
        return
      }

      if (editorColorsCustomized) {
        const confirmPref = loadThemeConfirmPreference()
        if (confirmPref === 'defaults') {
          if (!sameVisual) {
            clearImagePalette()
            base.setVisualTheme(visualThemeId)
          }
          if (!sameMode) setColorMode(mode)
          applyDefaultEditorColors(visualThemeId, mode)
          return
        }
        if (confirmPref === 'keep') {
          if (!sameVisual) commitVisualThemeOnly(visualThemeId)
          if (!sameMode) setColorMode(mode)
          return
        }
        setPendingChange({
          visualThemeId,
          colorMode: mode,
          themeLabel: sameVisual ? `${themeName} · ${modeLabel}` : `${themeName}`,
        })
        if (!sameVisual) commitVisualThemeOnly(visualThemeId)
        if (!sameMode) setColorMode(mode)
        return
      }

      if (!sameVisual) {
        clearImagePalette()
        base.setVisualTheme(visualThemeId)
      }
      if (!sameMode) setColorMode(mode)
      applyDefaultEditorColors(visualThemeId, mode)
    },
    [
      base,
      colorMode,
      editorColorsCustomized,
      commitVisualThemeOnly,
      setColorMode,
      applyDefaultEditorColors,
    ],
  )

  const requestSetVisualTheme = useCallback(
    (id: string) => {
      requestThemeContextChange(id, colorMode)
    },
    [requestThemeContextChange, colorMode],
  )

  const requestSetColorMode = useCallback(
    (mode: ColorMode) => {
      requestThemeContextChange(base.visualTheme, mode)
    },
    [requestThemeContextChange, base.visualTheme],
  )

  const setVisualTheme = requestSetVisualTheme

  const toggleColorMode = useCallback(() => {
    requestSetColorMode(colorMode === 'dark' ? 'light' : 'dark')
  }, [colorMode, requestSetColorMode])

  const cycleVisualTheme = useCallback(() => {
    const idx = VISUAL_THEME_ORDER.indexOf(
      base.visualTheme as (typeof VISUAL_THEME_ORDER)[number],
    )
    const next = VISUAL_THEME_ORDER[(idx + 1) % VISUAL_THEME_ORDER.length]
    requestSetVisualTheme(next)
  }, [base.visualTheme, requestSetVisualTheme])

  const updateEditorColors = useCallback(
    (next: ThemeColors) => {
      base.updateColors(next)
      setCustomized(true)
    },
    [base, setCustomized],
  )

  const updateColors = useCallback(
    (next: ThemeColors) => {
      base.updateColors(next)
    },
    [base],
  )

  const currentThemeName =
    base.visualThemes.find((t) => t.id === base.visualTheme)?.name ?? '夕岚'

  useEffect(() => {
    if (editorColorsCustomized) return
    applyDefaultEditorColors(base.visualTheme, colorMode)
    // 首次挂载：未自定义时让 CM6 配色与壁纸 + 明暗一致
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', colorMode === 'dark')
    document.documentElement.classList.remove('theme-xilan', 'theme-wushan', 'theme-zhihe')
    document.documentElement.classList.add(`theme-${base.visualTheme}`)
  }, [colorMode, base.visualTheme])

  useEffect(() => {
    applyEditorCssVars(base.colors, colorMode)
  }, [base.colors, colorMode])

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors: base.colors,
      updateColors,
      updateEditorColors,
      visualTheme: base.visualTheme,
      visualThemes: base.visualThemes,
      setVisualTheme,
      requestSetVisualTheme,
      colorMode,
      setColorMode,
      requestSetColorMode,
      toggleColorMode,
      cycleVisualTheme,
      currentThemeName,
      editorColorsCustomized,
      glass: glassClasses(colorMode),
    }),
    [
      base,
      updateColors,
      updateEditorColors,
      setVisualTheme,
      colorMode,
      setColorMode,
      requestSetColorMode,
      toggleColorMode,
      cycleVisualTheme,
      currentThemeName,
      editorColorsCustomized,
      requestSetVisualTheme,
    ],
  )

  return (
    <ThemeContext.Provider value={value}>
      {children}
      {pendingChange && (
        <EditorThemeConfirm
          themeLabel={pendingChange.themeLabel}
          onApplyDefaults={() => finishPending(true)}
          onKeepCurrent={() => finishPending(false)}
          onDontAskAgain={finishPendingDontAskAgain}
        />
      )}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}

export { glassClasses } from './glass'

export function isPdfFile(name: string): boolean {
  return /\.pdf$/i.test(name)
}
