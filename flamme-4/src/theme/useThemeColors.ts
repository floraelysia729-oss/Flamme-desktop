import { useState, useCallback } from 'react'

export interface ThemeColors {
  background: string
  text: string
  h1: string; h2: string; h3: string; h4: string; h5: string; h6: string
  bold: string
  italic: string
  code: string
  link: string
  quote: string
}

export interface VisualTheme {
  id: string
  name: string
  colors: string[]   // 4 theme colors
  /** 设置面板等处的预览缩略图 */
  bgImage: string
  /** 全屏背景清晰壁纸（见 public/themes/*-wallpaper.jpg） */
  wallpaperImage: string
}

export const visualThemes: VisualTheme[] = [
  {
    id: 'xilan',
    name: '夕岚',
    colors: ['#efc0d4', '#f7dfa1', '#cbcae2', '#cae2f5'],
    bgImage: '/themes/xilan.jpg',
    wallpaperImage: '/themes/xilan-wallpaper.jpg',
  },
  {
    id: 'wushan',
    name: '雾山',
    colors: ['#835e9c', '#b788b8', '#bfc1e0', '#9cc2e7'],
    bgImage: '/themes/wushan.jpg',
    wallpaperImage: '/themes/wushan-wallpaper.jpg',
  },
  {
    id: 'zhihe',
    name: '枝荷',
    colors: ['#84b9aa', '#efbe92', '#dae0e8', '#e69d60'],
    bgImage: '/themes/zhihe.jpg',
    wallpaperImage: '/themes/zhihe-wallpaper.jpg',
  },
]

const STORAGE_KEY = 'flamme-theme'
const VISUAL_THEME_KEY = 'flamme-visual-theme'

const defaultColors: ThemeColors = {
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

function loadColors(): ThemeColors {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return { ...defaultColors, ...JSON.parse(saved) }
  } catch { /* ignore */ }
  return { ...defaultColors }
}

function loadVisualTheme(): string {
  try {
    return localStorage.getItem(VISUAL_THEME_KEY) || 'xilan'
  } catch { return 'xilan' }
}

export function useThemeColors() {
  const [colors, setColors] = useState<ThemeColors>(loadColors)
  const [visualTheme, setVisualThemeState] = useState(loadVisualTheme)

  const updateColors = useCallback((next: ThemeColors) => {
    setColors(next)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  }, [])

  const setVisualTheme = useCallback((id: string) => {
    setVisualThemeState(id)
    try { localStorage.setItem(VISUAL_THEME_KEY, id) } catch { /* ignore */ }
  }, [])

  return {
    colors,
    updateColors,
    visualTheme,
    visualThemes,
    setVisualTheme,
    currentTheme: visualThemes.find((t) => t.id === visualTheme) ?? visualThemes[0],
  }
}
