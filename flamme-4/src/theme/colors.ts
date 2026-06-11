/**
 * Extract dominant colors from an image using canvas pixel sampling.
 * Returns top N colors sorted by frequency.
 */

export interface RGB { r: number; g: number; b: number }

export function rgbToHex(c: RGB): string {
  return '#' + [c.r, c.g, c.b].map(v => v.toString(16).padStart(2, '0')).join('')
}

export function hexToRgb(hex: string): RGB {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i)
  if (!m) return { r: 0, g: 0, b: 0 }
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
}

export function hexWithAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex)
  const a = Math.max(0, Math.min(1, alpha))
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

function colorDistance(a: RGB, b: RGB): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2)
}

function quantize(c: RGB, step = 32): RGB {
  return {
    r: Math.round(c.r / step) * step,
    g: Math.round(c.g / step) * step,
    b: Math.round(c.b / step) * step,
  }
}

export function extractColors(imageData: ImageData, count = 8): RGB[] {
  const buckets = new Map<string, { color: RGB; count: number }>()

  for (let i = 0; i < imageData.data.length; i += 16) { // sample every 4th pixel
    const r = imageData.data[i]
    const g = imageData.data[i + 1]
    const b = imageData.data[i + 2]
    const a = imageData.data[i + 3]
    if (a < 128) continue // skip transparent

    const q = quantize({ r, g, b })
    const key = `${q.r},${q.g},${q.b}`
    const existing = buckets.get(key)
    if (existing) {
      existing.count++
    } else {
      buckets.set(key, { color: q, count: 1 })
    }
  }

  // Sort by frequency, deduplicate similar colors
  const sorted = [...buckets.values()].sort((a, b) => b.count - a.count)
  const result: RGB[] = []

  for (const item of sorted) {
    if (result.length >= count) break
    const isDuplicate = result.some(c => colorDistance(c, item.color) < 50)
    if (!isDuplicate) {
      result.push(item.color)
    }
  }

  return result
}

export async function extractColorsFromImage(file: File, count = 8): Promise<RGB[]> {
  const img = new Image()
  const url = URL.createObjectURL(file)

  return new Promise((resolve, reject) => {
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const maxDim = 200
      const scale = Math.min(maxDim / img.width, maxDim / img.height, 1)
      canvas.width = Math.floor(img.width * scale)
      canvas.height = Math.floor(img.height * scale)

      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height)

      URL.revokeObjectURL(url)
      resolve(extractColors(data, count))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')) }
    img.src = url
  })
}
