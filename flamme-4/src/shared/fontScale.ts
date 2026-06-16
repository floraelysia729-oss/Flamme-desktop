const STORAGE_KEY = 'flamme-font-size'
const DEFAULT_EDITOR = 17
const DEFAULT_CHAT = 14
const MIN = 13
const MAX = 22

function clamp(n: number): number {
  return Math.min(MAX, Math.max(MIN, n))
}

function readStored(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const n = parseInt(raw, 10)
    return Number.isFinite(n) ? clamp(n) : null
  } catch {
    return null
  }
}

function writeStored(editorPx: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(editorPx))
  } catch {
    /* ignore */
  }
}

function chatSizeFromEditor(editorPx: number): number {
  return Math.round(editorPx * (DEFAULT_CHAT / DEFAULT_EDITOR))
}

export function getFontScale(): number {
  return readStored() ?? DEFAULT_EDITOR
}

export function setFontScale(editorPx: number): number {
  const next = clamp(editorPx)
  writeStored(next)
  applyFontScale(next)
  return next
}

export function adjustFontScale(delta: number): number {
  return setFontScale(getFontScale() + delta)
}

export function resetFontScale(): number {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
  applyFontScale(DEFAULT_EDITOR)
  return DEFAULT_EDITOR
}

export function applyFontScale(editorPx = getFontScale()): void {
  const editor = clamp(editorPx)
  const chat = chatSizeFromEditor(editor)
  document.documentElement.style.setProperty('--font-editor-size', `${editor}px`)
  document.documentElement.style.setProperty('--font-chat-size', `${chat}px`)
}
