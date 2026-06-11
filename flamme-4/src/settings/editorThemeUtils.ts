import { extractColorsFromImage, hexToRgb, rgbToHex, type RGB } from '../theme/colors'
import type { ThemeColors } from '../theme/useThemeColors'

export { extractColorsFromImage }

const IMAGE_PALETTE_KEY = 'flamme-editor-image-palette'

export function saveImagePalette(colors: RGB[]) {
  try {
    localStorage.setItem(IMAGE_PALETTE_KEY, JSON.stringify(colors))
  } catch {
    /* ignore */
  }
}

export function loadImagePalette(): RGB[] | null {
  try {
    const raw = localStorage.getItem(IMAGE_PALETTE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as RGB[]
    if (!Array.isArray(parsed) || parsed.length === 0) return null
    return parsed.filter(
      (c) =>
        typeof c?.r === 'number' &&
        typeof c?.g === 'number' &&
        typeof c?.b === 'number',
    )
  } catch {
    return null
  }
}

export function clearImagePalette() {
  try {
    localStorage.removeItem(IMAGE_PALETTE_KEY)
  } catch {
    /* ignore */
  }
}

function relativeLuminance(c: RGB): number {
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b
}

function rgbToHsl(c: RGB): { h: number; s: number; l: number } {
  const r = c.r / 255
  const g = c.g / 255
  const b = c.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return { h, s, l }
}

function hslToRgb(h: number, s: number, l: number): RGB {
  if (s === 0) {
    const v = Math.round(l * 255)
    return { r: v, g: v, b: v }
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t
    if (tt < 0) tt += 1
    if (tt > 1) tt -= 1
    if (tt < 1 / 6) return p + (q - p) * 6 * tt
    if (tt < 1 / 2) return q
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  }
}

function setHexLightness(hex: string, lightness: number): string {
  const rgb = hexToRgb(hex)
  const { h, s } = rgbToHsl(rgb)
  const l = Math.max(0, Math.min(1, lightness))
  const sat = s < 0.08 ? 0.35 : Math.min(1, s * 1.05)
  return rgbToHex(hslToRgb(h, sat, l))
}

function pickAccent(hex: string, lightness: number): string {
  return setHexLightness(hex, lightness)
}

export const EDITOR_COLOR_SLOTS: { key: keyof ThemeColors; label: string }[] = [
  { key: 'background', label: '背景' },
  { key: 'text', label: '正文' },
  { key: 'h1', label: 'H1' },
  { key: 'h2', label: 'H2' },
  { key: 'h3', label: 'H3' },
  { key: 'h4', label: 'H4' },
  { key: 'h5', label: 'H5' },
  { key: 'h6', label: 'H6' },
  { key: 'bold', label: '粗体' },
  { key: 'italic', label: '斜体' },
  { key: 'code', label: '代码' },
  { key: 'link', label: '链接' },
  { key: 'quote', label: '引用' },
]

export function parseThemeCSS(css: string, snippetCSS: string): ThemeColors | null {
  const varMap = new Map<string, string>()
  const varRe = /--([a-zA-Z0-9_-]+)\s*:\s*([^;]+)/g
  let varMatch
  while ((varMatch = varRe.exec(css)) !== null) {
    const name = varMatch[1]
    const val = varMatch[2].trim()
    const hexMatch = val.match(/#[0-9a-fA-F]{6}/)
    if (hexMatch) {
      varMap.set(name, hexMatch[0])
      continue
    }
    const rgbMatches = val.matchAll(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)
    let lastRgb = null
    for (const m of rgbMatches) lastRgb = m
    if (lastRgb) {
      varMap.set(name, rgbToHex({ r: +lastRgb[1], g: +lastRgb[2], b: +lastRgb[3] }))
    }
  }

  const resolve = (val: string): string | null => {
    if (val.startsWith('#')) return val
    const hexMatch = val.match(/#[0-9a-fA-F]{6}/)
    if (hexMatch) return hexMatch[0]
    const rgbMatch = val.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
    if (rgbMatch) return rgbToHex({ r: +rgbMatch[1], g: +rgbMatch[2], b: +rgbMatch[3] })
    const varRef = val.match(/var\(\s*--([a-zA-Z0-9_-]+)/)
    if (varRef) {
      const resolved = varMap.get(varRef[1])
      if (resolved) return resolved
    }
    return null
  }

  const get = (name: string): string | null => {
    const val = varMap.get(name)
    if (!val) return null
    return resolve(val) || val
  }

  const snippetDirectColors: Partial<ThemeColors> = {}
  const selectorMap: [RegExp, keyof ThemeColors][] = [
    [/\.cm-header-1|\.markdown-preview-view h1/g, 'h1'],
    [/\.cm-header-2|\.markdown-preview-view h2/g, 'h2'],
    [/\.cm-header-3|\.markdown-preview-view h3/g, 'h3'],
    [/\.cm-header-4|\.markdown-preview-view h4/g, 'h4'],
    [/\.cm-header-5|\.markdown-preview-view h5/g, 'h5'],
    [/\.cm-header-6|\.markdown-preview-view h6/g, 'h6'],
    [/\.cm-strong|\.markdown-preview-view strong/g, 'bold'],
    [/\.cm-em[^a-]|\.markdown-preview-view em/g, 'italic'],
    [/\.cm-inline-code|\.markdown-preview-view code/g, 'code'],
    [/\.cm-link|\.cm-url|\.markdown-preview-view a/g, 'link'],
    [/\.cm-quote|\.markdown-preview-view blockquote/g, 'quote'],
  ]

  for (const [re, key] of selectorMap) {
    const blockRe = new RegExp(re.source + `[^{]*\\{([^}]+)\\}`, 'g')
    const blockMatch = blockRe.exec(snippetCSS)
    if (blockMatch) {
      const colorMatch = blockMatch[1].match(/color\s*:\s*([^;]+)/)
      if (colorMatch) {
        const resolved = resolve(colorMatch[1].trim())
        if (resolved) snippetDirectColors[key] = resolved
      }
    }
  }

  return {
    background: get('ctp-base') || '#1e1e2e',
    text: get('ctp-text') || '#cdd6f4',
    h1: snippetDirectColors.h1 || get('ctp-rosewater') || '#f5c2e7',
    h2: snippetDirectColors.h2 || get('ctp-pink') || '#cba6f7',
    h3: snippetDirectColors.h3 || get('ctp-blue') || '#89b4fa',
    h4: snippetDirectColors.h4 || get('ctp-teal') || '#94e2d5',
    h5: snippetDirectColors.h5 || get('ctp-green') || '#a6e3a1',
    h6: snippetDirectColors.h6 || get('ctp-yellow') || '#f9e2af',
    bold: snippetDirectColors.bold || get('ctp-peach') || '#fab387',
    italic: snippetDirectColors.italic || get('ctp-rosewater') || '#f5e0dc',
    code: snippetDirectColors.code || get('ctp-green') || '#a6e3a1',
    link: snippetDirectColors.link || get('ctp-blue') || '#89b4fa',
    quote: snippetDirectColors.quote || get('ctp-overlay0') || '#6c7086',
  }
}

/** 按参考图色板映射编辑器配色，并按深浅模式保证对比度 */
export function autoMapColors(
  colors: RGB[],
  colorMode: 'light' | 'dark' = 'dark',
): ThemeColors {
  if (colors.length === 0) {
    return colorMode === 'light'
      ? {
          background: '#faf8f5',
          text: '#2a2520',
          h1: '#6b4a58',
          h2: '#5a4a6b',
          h3: '#3a5a7b',
          h4: '#4a6b5a',
          h5: '#5a5a3a',
          h6: '#6b5a3a',
          bold: '#4a3020',
          italic: '#5a4048',
          code: '#2a4a3a',
          link: '#3a5a8b',
          quote: '#5a5550',
        }
      : {
          background: '#1e1e2e',
          text: '#e8ecfc',
          h1: '#f8d4f0',
          h2: '#dcc8ff',
          h3: '#a8c8ff',
          h4: '#b0f0e8',
          h5: '#c0f0b8',
          h6: '#fff0b8',
          bold: '#ffc8a0',
          italic: '#fce8e4',
          code: '#c0f0b8',
          link: '#a8c8ff',
          quote: '#a8b0c8',
        }
  }

  const sorted = [...colors].sort(
    (a, b) => relativeLuminance(a) - relativeLuminance(b),
  )
  const darkest = rgbToHex(sorted[0])
  const lightest = rgbToHex(sorted[sorted.length - 1])
  const mid = (i: number) =>
    sorted[Math.min(1 + i, sorted.length - 2)] ?? sorted[0]
  const midHex = (i: number) => rgbToHex(mid(i))
  const second = sorted[1] ? rgbToHex(sorted[1]) : darkest

  if (colorMode === 'light') {
    return {
      background: setHexLightness(lightest, 0.9),
      text: setHexLightness(darkest, 0.18),
      h1: pickAccent(midHex(0), 0.34),
      h2: pickAccent(midHex(1), 0.32),
      h3: pickAccent(midHex(2), 0.30),
      h4: pickAccent(midHex(3), 0.32),
      h5: pickAccent(midHex(4), 0.30),
      h6: pickAccent(midHex(5), 0.28),
      bold: pickAccent(midHex(0), 0.26),
      italic: pickAccent(midHex(1), 0.30),
      code: pickAccent(midHex(2), 0.28),
      link: pickAccent(midHex(3), 0.32),
      quote: setHexLightness(second, 0.44),
    }
  }

  return {
    background: setHexLightness(darkest, 0.14),
    text: setHexLightness(lightest, 0.92),
    h1: pickAccent(midHex(0), 0.78),
    h2: pickAccent(midHex(1), 0.76),
    h3: pickAccent(midHex(2), 0.74),
    h4: pickAccent(midHex(3), 0.76),
    h5: pickAccent(midHex(4), 0.74),
    h6: pickAccent(midHex(5), 0.72),
    bold: pickAccent(midHex(0), 0.80),
    italic: pickAccent(midHex(1), 0.76),
    code: pickAccent(midHex(2), 0.82),
    link: pickAccent(midHex(3), 0.78),
    quote: setHexLightness(second, 0.62),
  }
}

/** 保存参考图色板并生成当前明暗下的编辑器配色 */
export function applyImagePalette(
  palette: RGB[],
  colorMode: 'light' | 'dark',
): ThemeColors {
  saveImagePalette(palette)
  return autoMapColors(palette, colorMode)
}

export async function importObsidianTheme(
  updateColors: (c: ThemeColors) => void,
): Promise<string> {
  const dirHandle = await (window as unknown as { showDirectoryPicker: (o: object) => Promise<FileSystemDirectoryHandle> })
    .showDirectoryPicker({ mode: 'read' })
  let obsidianDir: FileSystemDirectoryHandle | null = null
  for await (const entry of dirHandle.values()) {
    if (entry.name === '.obsidian' && entry.kind === 'directory') {
      obsidianDir = entry as FileSystemDirectoryHandle
      break
    }
  }
  if (!obsidianDir) return '未找到 .obsidian 目录'

  const appFile = await obsidianDir.getFileHandle('appearance.json')
  const appText = await (await appFile.getFile()).text()
  const app = JSON.parse(appText) as { cssTheme?: string; enabledCssSnippets?: string[] }
  const themeName = app.cssTheme
  if (!themeName) return '使用的是默认主题，无自定义配色'

  const themesDir = await obsidianDir.getDirectoryHandle('themes')
  const themeDir = await themesDir.getDirectoryHandle(themeName)
  const cssFile = await themeDir.getFileHandle('theme.css')
  const css = await (await cssFile.getFile()).text()

  const allSnippetCSS: string[] = []
  try {
    const snippetsDir = await obsidianDir.getDirectoryHandle('snippets')
    const enabledSnippets: string[] = app.enabledCssSnippets || []
    for (const name of enabledSnippets) {
      try {
        const fileName = name.endsWith('.css') ? name : `${name}.css`
        const sf = await snippetsDir.getFileHandle(fileName)
        allSnippetCSS.push(await (await sf.getFile()).text())
      } catch {
        /* skip */
      }
    }
  } catch {
    /* no snippets */
  }

  const parsed = parseThemeCSS(css, allSnippetCSS.join('\n'))
  if (!parsed) return '无法解析主题配色'

  clearImagePalette()
  updateColors(parsed)
  return `已导入: ${themeName}`
}
