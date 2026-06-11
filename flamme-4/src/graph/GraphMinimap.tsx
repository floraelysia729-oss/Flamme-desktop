import { useCallback, useEffect, useRef } from 'react'
import { withAlpha, type GraphColorScheme } from './colors'

export interface ZoomTransform {
  k: number
  x: number
  y: number
}

interface NodePoint {
  id: string
  x: number
  y: number
  type: string
  community?: number
}

interface LinkSeg {
  x1: number
  y1: number
  x2: number
  y2: number
}

interface Props {
  nodes: NodePoint[]
  links: LinkSeg[]
  mainWidth: number
  mainHeight: number
  zoom: ZoomTransform
  highlightId: string | null
  scheme: GraphColorScheme
  onNavigateTo: (graphX: number, graphY: number) => void
  onZoomChange?: () => void
}

const MAP_W = 160
const MAP_H = 110
const PAD = 8

function computeBounds(nodes: NodePoint[]) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    if (n.x == null || n.y == null) continue
    minX = Math.min(minX, n.x)
    minY = Math.min(minY, n.y)
    maxX = Math.max(maxX, n.x)
    maxY = Math.max(maxY, n.y)
  }
  if (!Number.isFinite(minX)) {
    return { minX: -1, minY: -1, maxX: 1, maxY: 1 }
  }
  const mx = (maxX - minX) * 0.06 + 12
  const my = (maxY - minY) * 0.06 + 12
  return { minX: minX - mx, minY: minY - my, maxX: maxX + mx, maxY: maxY + my }
}

function graphToMinimap(
  gx: number,
  gy: number,
  bounds: ReturnType<typeof computeBounds>,
  scale: number,
  offsetX: number,
  offsetY: number,
) {
  return {
    x: (gx - bounds.minX) * scale + offsetX,
    y: (gy - bounds.minY) * scale + offsetY,
  }
}

function minimapToGraph(
  mx: number,
  my: number,
  bounds: ReturnType<typeof computeBounds>,
  scale: number,
  offsetX: number,
  offsetY: number,
) {
  return {
    x: (mx - offsetX) / scale + bounds.minX,
    y: (my - offsetY) / scale + bounds.minY,
  }
}

export default function GraphMinimap({
  nodes,
  links,
  mainWidth,
  mainHeight,
  zoom,
  highlightId,
  scheme,
  onNavigateTo,
  onZoomChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef(false)
  const rafRef = useRef(0)

  const paint = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || nodes.length === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = MAP_W * dpr
    canvas.height = MAP_H * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const bounds = computeBounds(nodes)
    const spanX = bounds.maxX - bounds.minX || 1
    const spanY = bounds.maxY - bounds.minY || 1
    const innerW = MAP_W - PAD * 2
    const innerH = MAP_H - PAD * 2
    const scale = Math.min(innerW / spanX, innerH / spanY)
    const offsetX = PAD + (innerW - spanX * scale) / 2
    const offsetY = PAD + (innerH - spanY * scale) / 2

    ctx.clearRect(0, 0, MAP_W, MAP_H)
    ctx.fillStyle = withAlpha(scheme.pillBg, 0.92)
    ctx.strokeStyle = withAlpha(scheme.fallback, 0.35)
    ctx.lineWidth = 1
    roundRect(ctx, 0.5, 0.5, MAP_W - 1, MAP_H - 1, 8)
    ctx.fill()
    ctx.stroke()

    const drawLinks = nodes.length <= 300
    if (drawLinks) {
      ctx.strokeStyle = withAlpha(scheme.fallback, 0.2)
      ctx.lineWidth = 0.5
      for (const l of links) {
        const a = graphToMinimap(l.x1, l.y1, bounds, scale, offsetX, offsetY)
        const b = graphToMinimap(l.x2, l.y2, bounds, scale, offsetX, offsetY)
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
    }

    for (const n of nodes) {
      const p = graphToMinimap(n.x, n.y, bounds, scale, offsetX, offsetY)
      const isHi = n.id === highlightId
      ctx.beginPath()
      ctx.arc(p.x, p.y, isHi ? 3 : 2, 0, Math.PI * 2)
      ctx.fillStyle = isHi ? scheme.accent : withAlpha(scheme.fallback, 0.65)
      ctx.fill()
    }

    const cx = (mainWidth / 2 - zoom.x) / zoom.k
    const cy = (mainHeight / 2 - zoom.y) / zoom.k

    const vw = mainWidth / zoom.k
    const vh = mainHeight / zoom.k
    const tl = graphToMinimap(cx - vw / 2, cy - vh / 2, bounds, scale, offsetX, offsetY)
    const br = graphToMinimap(cx + vw / 2, cy + vh / 2, bounds, scale, offsetX, offsetY)
    const rx = Math.min(tl.x, br.x)
    const ry = Math.min(tl.y, br.y)
    const rw = Math.abs(br.x - tl.x)
    const rh = Math.abs(br.y - tl.y)

    ctx.strokeStyle = withAlpha(scheme.accent, 0.85)
    ctx.lineWidth = 1.5
    ctx.strokeRect(rx, ry, rw, rh)
    ctx.fillStyle = withAlpha(scheme.accent, 0.08)
    ctx.fillRect(rx, ry, rw, rh)
  }, [nodes, links, mainWidth, mainHeight, zoom, highlightId, scheme])

  useEffect(() => {
    paint()
  }, [paint])

  const navigateFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || nodes.length === 0) return

    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    const bounds = computeBounds(nodes)
    const spanX = bounds.maxX - bounds.minX || 1
    const spanY = bounds.maxY - bounds.minY || 1
    const innerW = MAP_W - PAD * 2
    const innerH = MAP_H - PAD * 2
    const scale = Math.min(innerW / spanX, innerH / spanY)
    const offsetX = PAD + (innerW - spanX * scale) / 2
    const offsetY = PAD + (innerH - spanY * scale) / 2

    const { x, y } = minimapToGraph(mx, my, bounds, scale, offsetX, offsetY)
    onNavigateTo(x, y)
    onZoomChange?.()
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(paint)
  }

  return (
    <canvas
      ref={canvasRef}
      className="graph-minimap"
      width={MAP_W}
      height={MAP_H}
      aria-label="图谱概览"
      onPointerDown={(e) => {
        dragRef.current = true
        ;(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId)
        navigateFromEvent(e)
      }}
      onPointerMove={(e) => {
        if (!dragRef.current) return
        navigateFromEvent(e)
      }}
      onPointerUp={(e) => {
        dragRef.current = false
        ;(e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId)
      }}
    />
  )
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}
