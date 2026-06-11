import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { forceCollide } from 'd3-force-3d'
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d'
import { Network, RefreshCw, X } from 'lucide-react'
import { buildGraph, getFullGraph, getGraphStats } from '../api/bridge'
import type { GraphNode, GraphResponse, GraphStats } from './types'
import {
  displayRelationLabel,
  isDirectedRelation,
  isUndirectedRelation,
  linkColor,
  linkLabelOffset,
  nodeFill,
  withAlpha,
  type GraphColorScheme,
} from './colors'
import { useGraphThemeColors } from './useGraphThemeColors'
import { applyHierarchyLayout, clearFixedPositions, freezeGraphPositions } from './treeLayout'
import { applyCommunityLayout } from './communityLayout'
import GraphMinimap, { type ZoomTransform } from './GraphMinimap'
import {
  assessHierarchyQuality,
  isHierarchyLayoutViable,
  LAYOUT_UI_LABELS,
  resolveLayoutMode,
  type LayoutMode,
  type ResolvedLayoutMode,
} from './layoutMode'
import {
  EDGE_PRESET_LABELS,
  hiddenRelationsForPreset,
  loadEdgePreset,
  loadLayoutMode,
  saveEdgePreset,
  saveLayoutMode,
  type EdgePreset,
} from './layoutPresets'
import {
  clampNodeRadius,
  computeForceLayoutParams,
  fuzzyMatchNode,
  labelOpacity,
  neighborIds,
  nodeValForForce,
  oneHopSubgraph,
} from './graphVisual'

type ForceNode = GraphNode & { x?: number; y?: number; fx?: number; fy?: number }
type ForceLink = { source: string | ForceNode; target: string | ForceNode; label: string }

interface GraphData {
  nodes: ForceNode[]
  links: ForceLink[]
  resolvedLayout: ResolvedLayoutMode
  pinnedIds: Set<string>
  hierarchyViable: boolean
}

interface Props {
  onOpenEntity?: (nodeId: string) => void
}

function linkNodeId(endpoint: string | ForceNode): string {
  return typeof endpoint === 'object' ? endpoint.id : endpoint
}

function isLinkAdjacentTo(link: ForceLink, nodeId: string | null): boolean {
  if (!nodeId) return false
  return linkNodeId(link.source) === nodeId || linkNodeId(link.target) === nodeId
}

function buildGraphData(
  raw: GraphResponse,
  entitiesOnly: boolean,
  hiddenRelations: Set<string>,
  layoutMode: LayoutMode,
): GraphData {
  let nodes: ForceNode[] = raw.nodes.map((n) => ({ ...n }))
  if (entitiesOnly) {
    nodes = nodes.filter((n) => n.type === 'entity' || n.type === 'concept')
  }

  let links: ForceLink[] = raw.edges
    .filter((e) => !hiddenRelations.has(e.label))
    .map((e) => ({ ...e }))

  if (entitiesOnly) {
    const ids = new Set(nodes.map((n) => n.id))
    links = links.filter(
      (e) => ids.has(linkNodeId(e.source)) && ids.has(linkNodeId(e.target)),
    )
  }

  const activeIds = new Set<string>()
  for (const l of links) {
    activeIds.add(linkNodeId(l.source))
    activeIds.add(linkNodeId(l.target))
  }
  nodes = nodes.filter((n) => activeIds.has(n.id))

  const layoutLinks = links.map((l) => ({
    source: linkNodeId(l.source),
    target: linkNodeId(l.target),
    label: l.label,
  }))

  const hierarchyMetrics = assessHierarchyQuality(nodes, layoutLinks)
  const hierarchyViable = isHierarchyLayoutViable(hierarchyMetrics)
  let resolvedLayout = resolveLayoutMode(layoutMode, nodes, layoutLinks)

  clearFixedPositions(nodes)
  let pinnedIds = new Set<string>()

  if (resolvedLayout === 'hierarchy') {
    const result = applyHierarchyLayout(nodes, layoutLinks)
    if (result.applied) {
      pinnedIds = result.pinnedIds
    } else {
      resolvedLayout = 'force'
    }
  } else if (resolvedLayout === 'community') {
    applyCommunityLayout(nodes, layoutLinks)
  }

  return { nodes, links, resolvedLayout, pinnedIds, hierarchyViable }
}

function linkFontSize(globalScale: number): number {
  const size = 7.5 / Math.max(globalScale, 0.55)
  return Math.round(Math.min(8, Math.max(7, size)))
}

function nodeFontSize(globalScale: number): number {
  const size = 9 / Math.max(globalScale, 0.55)
  return Math.round(Math.min(10, Math.max(8, size)))
}

function isCanonicalLinkForLabel(link: ForceLink): boolean {
  if (!isUndirectedRelation(link.label)) return true
  const a = linkNodeId(link.source)
  const b = linkNodeId(link.target)
  return a < b
}

function drawLinkLabel(
  link: ForceLink,
  ctx: CanvasRenderingContext2D,
  globalScale: number,
  scheme: GraphColorScheme,
  highlightId: string | null,
) {
  const src = link.source as ForceNode
  const tgt = link.target as ForceNode
  if (src.x == null || src.y == null || tgt.x == null || tgt.y == null) return
  if (!highlightId) return
  if (!isLinkAdjacentTo(link, highlightId)) return
  if (!isCanonicalLinkForLabel(link)) return

  const dx = tgt.x - src.x
  const dy = tgt.y - src.y
  const len = Math.hypot(dx, dy)
  if (len < 1) return

  const nx = -dy / len
  const ny = dx / len
  const linkKey = `${linkNodeId(link.source)}|${linkNodeId(link.target)}|${link.label}`
  const along = 0.38 + ((linkKey.charCodeAt(0) ?? 0) % 24) / 100
  const perp = linkLabelOffset(linkKey, globalScale)

  const mx = Math.round(src.x + dx * along + nx * perp)
  const my = Math.round(src.y + dy * along + ny * perp)

  const text = displayRelationLabel(link.label)
  const lineColor = linkColor(link.label, scheme)
  const fontSize = linkFontSize(globalScale)
  ctx.font = `${fontSize}px system-ui, sans-serif`
  const tw = ctx.measureText(text).width
  const padX = 2
  const padY = 1
  const pillW = Math.ceil(tw) + padX * 2
  const pillH = fontSize + padY * 2

  ctx.fillStyle = scheme.linkLabelBg
  ctx.fillRect(mx - pillW / 2, my - pillH / 2, pillW, pillH)
  ctx.strokeStyle = lineColor
  ctx.lineWidth = Math.max(1, 1.25 / globalScale)
  ctx.strokeRect(mx - pillW / 2 + 0.5, my - pillH / 2 + 0.5, pillW - 1, pillH - 1)

  ctx.fillStyle = scheme.linkLabelText
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, mx, my)
}

const LAYOUT_OPTIONS: { value: LayoutMode; label: string }[] = [
  { value: 'network', label: LAYOUT_UI_LABELS.network },
  { value: 'hierarchy', label: LAYOUT_UI_LABELS.hierarchy },
]

function disableSimulationForces(fg: ForceGraphMethods<ForceNode, ForceLink>) {
  fg.d3Force('charge')?.strength(0)
  const linkForce = fg.d3Force('link')
  if (linkForce) linkForce.distance(0).strength(0)
  fg.d3Force('collision', null)
}

export default function GraphPanel({ onOpenEntity }: Props) {
  const scheme = useGraphThemeColors()
  const wrapRef = useRef<HTMLDivElement>(null)
  const fgRef = useRef<ForceGraphMethods<ForceNode, ForceLink> | undefined>(undefined)
  const fitKey = useRef('')
  const layoutFrozen = useRef(false)
  const lastClickRef = useRef<{ id: string; time: number } | null>(null)
  const [zoom, setZoom] = useState<ZoomTransform>({ k: 1, x: 0, y: 0 })
  const [minimapTick, setMinimapTick] = useState(0)
  const [size, setSize] = useState({ w: 640, h: 420 })
  const [raw, setRaw] = useState<GraphResponse | null>(null)
  const [stats, setStats] = useState<GraphStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [building, setBuilding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<GraphNode | null>(null)
  const [hoverNode, setHoverNode] = useState<ForceNode | null>(null)
  const [entitiesOnly, setEntitiesOnly] = useState(false)
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => loadLayoutMode())
  const [edgePreset, setEdgePreset] = useState<EdgePreset>(() => loadEdgePreset())
  const [hiddenRelations, setHiddenRelations] = useState<Set<string>>(() => {
    const preset = loadEdgePreset()
    if (preset === 'custom') return new Set(['wikilink', 'has_entity'])
    return hiddenRelationsForPreset(preset)
  })
  const [focusId, setFocusId] = useState('')
  const [localExploreId, setLocalExploreId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [graph, st] = await Promise.all([getFullGraph(), getGraphStats().catch(() => null)])
      setRaw(graph)
      setStats(st)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载图谱失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setSize({ w: Math.floor(width), h: Math.floor(height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const effectiveRaw = useMemo((): GraphResponse | null => {
    if (!raw) return null
    if (!localExploreId) return raw
    const sub = oneHopSubgraph(localExploreId, raw.nodes, raw.edges)
    return { nodes: sub.nodes, edges: sub.edges }
  }, [raw, localExploreId])

  const graphData = useMemo((): GraphData => {
    if (!effectiveRaw) {
      return {
        nodes: [],
        links: [],
        resolvedLayout: 'force',
        pinnedIds: new Set(),
        hierarchyViable: false,
      }
    }
    return buildGraphData(effectiveRaw, entitiesOnly, hiddenRelations, layoutMode)
  }, [effectiveRaw, entitiesOnly, hiddenRelations, layoutMode])

  const relationCounts = useMemo(() => {
    if (!effectiveRaw) return [] as [string, number][]
    const base = buildGraphData(effectiveRaw, entitiesOnly, new Set(), layoutMode)
    const m = new Map<string, number>()
    for (const e of base.links) {
      const k = e.label || 'unknown'
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [effectiveRaw, entitiesOnly, layoutMode])

  const totalRelationCount = useMemo(
    () => relationCounts.reduce((s, [, c]) => s + c, 0),
    [relationCounts],
  )

  const highlightId = hoverNode?.id ?? selected?.id ?? null
  const highlightNeighbors = useMemo(() => {
    if (!highlightId) return null
    return neighborIds(highlightId, graphData.links)
  }, [highlightId, graphData.links])

  const { nodes, links, resolvedLayout, hierarchyViable } = graphData
  const nodeCount = nodes.length
  const linkCount = links.length
  const isHierarchy = resolvedLayout === 'hierarchy'
  const isCommunity = resolvedLayout === 'community'

  const stableGraphData = useMemo(() => ({ nodes, links }), [nodes, links])

  const forceParams = useMemo(
    () => computeForceLayoutParams(nodeCount, linkCount, isCommunity),
    [nodeCount, linkCount, isCommunity],
  )

  const minimapNodes = useMemo(
    () =>
      nodes
        .filter((n) => n.x != null && n.y != null)
        .map((n) => ({
          id: n.id,
          x: n.x!,
          y: n.y!,
          type: n.type,
          community: n.community,
        })),
    [nodes, minimapTick],
  )

  const minimapLinks = useMemo(() => {
    const segs: { x1: number; y1: number; x2: number; y2: number }[] = []
    for (const l of links) {
      const src = l.source as ForceNode
      const tgt = l.target as ForceNode
      if (src.x == null || src.y == null || tgt.x == null || tgt.y == null) continue
      segs.push({ x1: src.x, y1: src.y, x2: tgt.x, y2: tgt.y })
    }
    return segs
  }, [links, minimapTick])

  useEffect(() => {
    if (!layoutFrozen.current) fgRef.current?.d3ReheatSimulation()
  }, [scheme])

  useEffect(() => {
    fitKey.current = ''
    layoutFrozen.current = false
  }, [graphData, size.w, size.h])

  useEffect(() => {
    const fg = fgRef.current
    if (!fg || nodeCount === 0) return

    if (layoutFrozen.current || isHierarchy) {
      disableSimulationForces(fg)
      return
    }

    fg.d3Force('charge')?.strength(forceParams.charge)
    const linkForce = fg.d3Force('link')
    if (linkForce) {
      linkForce
        .distance((link: ForceLink) => {
          const src = typeof link.source === 'object' ? link.source : null
          const tgt = typeof link.target === 'object' ? link.target : null
          return forceParams.linkDistance(src?.val ?? 1, tgt?.val ?? 1)
        })
        .strength(forceParams.linkStrength)
    }
    fg.d3Force(
      'collision',
      forceCollide<ForceNode>()
        .radius((n: ForceNode) => forceParams.collisionRadius(n.val))
        .strength(0.9) as never,
    )
    fg.d3ReheatSimulation()
  }, [graphData, nodeCount, isHierarchy, isCommunity, forceParams])

  const handleLayoutModeChange = (mode: LayoutMode) => {
    setLayoutMode(mode)
    saveLayoutMode(mode)
  }

  const handleEdgePresetChange = (preset: EdgePreset) => {
    setEdgePreset(preset)
    saveEdgePreset(preset)
    if (preset !== 'custom') {
      setHiddenRelations(hiddenRelationsForPreset(preset))
    }
  }

  const toggleRelationVisibility = (rel: string) => {
    setEdgePreset('custom')
    saveEdgePreset('custom')
    setHiddenRelations((prev) => {
      const next = new Set(prev)
      if (next.has(rel)) next.delete(rel)
      else next.add(rel)
      return next
    })
  }

  const handleRebuild = async () => {
    setBuilding(true)
    setError(null)
    try {
      const graph = await buildGraph()
      if ('error' in graph && graph.error) {
        throw new Error(String(graph.error))
      }
      setRaw(graph as GraphResponse)
      setLocalExploreId(null)
      const st = await getGraphStats().catch(() => null)
      setStats(st)
    } catch (e) {
      setError(e instanceof Error ? e.message : '重建图谱失败')
    } finally {
      setBuilding(false)
    }
  }

  const focusNode = (query: string) => {
    const node = fuzzyMatchNode(nodes, query) as ForceNode | undefined
    if (!node || node.x == null || node.y == null) return
    fgRef.current?.centerAt(node.x, node.y, 400)
    fgRef.current?.zoom(2.5, 400)
    setSelected(node)
  }

  const handleFocusSubmit = () => {
    const q = focusId.trim()
    if (!q) return
    focusNode(q)
  }

  const fitPadding = Math.max(48, size.h * 0.08)

  const layoutHint =
    layoutMode === 'hierarchy' && !hierarchyViable
      ? '先修边较少，建议切换关联网络布局'
      : null

  return (
    <div className="graph-panel dashboard-panel-bubble flex-1 min-h-0 flex flex-col gap-2 overflow-hidden">
      <div className="graph-panel__toolbar flex flex-wrap items-center gap-2 px-3 pt-3 shrink-0">
        <Network size={16} className="text-[var(--accent)]" strokeWidth={2.25} />
        <span className="dashboard-panel-title">知识图谱</span>
        <span className="text-xs text-[var(--ink-muted)]">
          {nodeCount} 节点 · {linkCount} 边
          {stats?.entity_count != null ? ` · ${stats.entity_count} 实体` : ''}
          {' · '}
          {LAYOUT_UI_LABELS[layoutMode]}
        </span>
        <div className="flex-1" />
        <div className="graph-panel__seg" role="group" aria-label="布局模式">
          {LAYOUT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`graph-panel__seg-btn ${layoutMode === opt.value ? 'graph-panel__seg-btn--active' : ''}`}
              onClick={() => handleLayoutModeChange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <select
          className="graph-panel__preset text-xs px-2 py-1 rounded-lg border border-[var(--dashboard-panel-border)] bg-transparent"
          value={edgePreset}
          onChange={(e) => handleEdgePresetChange(e.target.value as EdgePreset)}
          aria-label="边类型预设"
        >
          <option value="hierarchy">{EDGE_PRESET_LABELS.hierarchy}</option>
          <option value="network">{EDGE_PRESET_LABELS.network}</option>
          <option value="overview">{EDGE_PRESET_LABELS.overview}</option>
          <option value="all">{EDGE_PRESET_LABELS.all}</option>
          <option value="custom">自定义</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs text-[var(--ink-muted)] cursor-pointer">
          <input
            type="checkbox"
            checked={entitiesOnly}
            onChange={(e) => setEntitiesOnly(e.target.checked)}
          />
          仅实体
        </label>
        <input
          className="graph-panel__search text-xs px-2 py-1 rounded-lg border border-[var(--dashboard-panel-border)] bg-transparent w-28"
          placeholder="定位节点…"
          value={focusId}
          onChange={(e) => setFocusId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleFocusSubmit()}
        />
        <button
          type="button"
          className="tool-btn p-1.5 rounded-lg"
          title="刷新"
          disabled={loading || building}
          onClick={() => void load()}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
        <button
          type="button"
          className="px-2.5 py-1 rounded-lg text-xs font-medium text-white disabled:opacity-50"
          style={{ background: 'var(--accent)' }}
          disabled={building}
          onClick={() => void handleRebuild()}
        >
          {building ? '重建中…' : '重建图谱'}
        </button>
      </div>

      {localExploreId && (
        <div className="graph-panel__explore-banner flex items-center gap-2 px-3 text-xs text-[var(--ink-muted)] shrink-0">
          <span>局部探索：仅显示 1-hop 邻居</span>
          <button
            type="button"
            className="graph-panel__explore-clear flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-[var(--bg-elevated)]/60"
            onClick={() => setLocalExploreId(null)}
          >
            <X size={12} />
            退出
          </button>
        </div>
      )}

      {layoutHint && (
        <p className="text-xs px-3 shrink-0 text-[var(--ink-muted)]">{layoutHint}</p>
      )}

      {error && (
        <p className="text-xs px-3 shrink-0" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}

      <div className="graph-panel__body flex-1 min-h-0 flex gap-2 px-3 pb-3">
        <div ref={wrapRef} className="graph-panel__canvas flex-1 min-h-0 min-w-0 rounded-xl overflow-hidden relative">
          {loading && !raw && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-[var(--ink-muted)]">
              加载图谱…
            </div>
          )}
          {!loading && nodeCount === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-[var(--ink-muted)] px-6 text-center">
              <p>图谱为空。请先摄入讲义并点击「重建图谱」。</p>
            </div>
          )}
          {nodeCount > 0 && (
            <ForceGraph2D
              ref={fgRef}
              width={size.w}
              height={size.h}
              graphData={stableGraphData}
              onZoom={(transform) => {
                setZoom({ k: transform.k, x: transform.x, y: transform.y })
              }}
              nodeId="id"
              nodeLabel={(n) => `${n.label} (${n.type})`}
              nodeVal={(n) => nodeValForForce(n.val)}
              nodeCanvasObject={(node, ctx, globalScale) => {
                const n = node as ForceNode
                const r = clampNodeRadius(n.val)
                const isHover = highlightId === n.id
                const isSel = selected?.id === n.id
                const dimmed =
                  highlightNeighbors != null && !highlightNeighbors.has(n.id)
                const cx = Math.round(n.x ?? 0)
                const cy = Math.round(n.y ?? 0)
                ctx.beginPath()
                ctx.arc(cx, cy, r, 0, 2 * Math.PI)
                const fill = nodeFill(n.type, n.community, scheme)
                ctx.fillStyle = dimmed ? withAlpha(fill, 0.15) : fill
                ctx.fill()
                if (isSel || isHover) {
                  ctx.strokeStyle = scheme.accent
                  ctx.lineWidth = (isHover ? 2.5 : 2) / globalScale
                  ctx.stroke()
                }
                const alpha = labelOpacity(globalScale, isHover || isSel)
                if (alpha > 0) {
                  const labelY = Math.round(cy + r + 8 / globalScale)
                  ctx.font = `${nodeFontSize(globalScale)}px system-ui, sans-serif`
                  ctx.textAlign = 'center'
                  ctx.textBaseline = 'top'
                  ctx.fillStyle = withAlpha(scheme.label, dimmed ? alpha * 0.2 : alpha)
                  ctx.fillText(n.label, cx, labelY)
                }
              }}
              nodeCanvasObjectMode={() => 'after'}
              linkColor={(l) => {
                const base = linkColor(l.label, scheme)
                if (!highlightId) return withAlpha(base, 0.7)
                if (isLinkAdjacentTo(l, highlightId)) return base
                return withAlpha(base, 0.05)
              }}
              linkWidth={(l) => {
                const directed = isDirectedRelation(l.label)
                const base = directed ? 1.8 : 1.2
                if (!highlightId) return base
                return isLinkAdjacentTo(l, highlightId) ? base + 2.2 : base * 0.35
              }}
              linkDirectionalArrowLength={(l) => {
                if (!isDirectedRelation(l.label)) return 0
                if (highlightId && isLinkAdjacentTo(l, highlightId)) return 9
                return 6
              }}
              linkDirectionalArrowRelPos={0.88}
              linkCanvasObject={(link, ctx, globalScale) => {
                drawLinkLabel(link, ctx, globalScale, scheme, highlightId)
              }}
              linkCanvasObjectMode={() => 'after'}
              onNodeHover={(n) => setHoverNode((n as ForceNode | null) ?? null)}
              onNodeClick={(n) => {
                const node = n as GraphNode
                const now = Date.now()
                const last = lastClickRef.current
                if (last?.id === node.id && now - last.time < 350) {
                  setLocalExploreId(node.id)
                  setSelected(node)
                  lastClickRef.current = null
                  return
                }
                lastClickRef.current = { id: node.id, time: now }
                setSelected(node)
                if (onOpenEntity && (node.type === 'entity' || node.type === 'concept')) {
                  onOpenEntity(node.id)
                }
              }}
              onBackgroundClick={() => setSelected(null)}
              onEngineTick={() => {
                for (const n of nodes) {
                  if (n.fx != null && n.fy != null) {
                    n.x = n.fx
                    n.y = n.fy
                  }
                }
              }}
              onEngineStop={() => {
                const fg = fgRef.current
                if (!fg) return
                const key = `${resolvedLayout}:${nodes.map((n) => n.id).join(',')}`
                if (fitKey.current !== key) {
                  fitKey.current = key
                  fg.zoomToFit(400, fitPadding)
                }
                freezeGraphPositions(nodes)
                layoutFrozen.current = true
                disableSimulationForces(fg)
                setMinimapTick((t) => t + 1)
              }}
              warmupTicks={isHierarchy ? 20 : forceParams.warmupTicks}
              cooldownTicks={isHierarchy ? 40 : forceParams.cooldownTicks}
              d3AlphaDecay={isHierarchy ? 0.05 : forceParams.alphaDecay}
              d3VelocityDecay={0.35}
            />
          )}
          {nodeCount > 0 && (
            <GraphMinimap
              nodes={minimapNodes}
              links={minimapLinks}
              mainWidth={size.w}
              mainHeight={size.h}
              zoom={zoom}
              highlightId={highlightId}
              scheme={scheme}
              onNavigateTo={(x, y) => fgRef.current?.centerAt(x, y, 0)}
              onZoomChange={() => setMinimapTick((t) => t + 1)}
            />
          )}
        </div>

        <aside className="graph-panel__aside w-48 shrink-0 flex flex-col gap-3 text-xs overflow-y-auto">
          <div>
            <div className="font-semibold text-[var(--ink)] mb-1.5">边类型</div>
            <p className="text-[10px] text-[var(--ink-muted)] mb-1.5 leading-snug">点击切换显示</p>
            <ul className="space-y-0.5">
              {relationCounts.map(([rel, cnt]) => {
                const visible = !hiddenRelations.has(rel)
                const pct = totalRelationCount > 0 ? (cnt / totalRelationCount) * 100 : 0
                return (
                  <li key={rel}>
                    <button
                      type="button"
                      onClick={() => toggleRelationVisibility(rel)}
                      className={`graph-panel__legend-btn w-full flex flex-col gap-1 px-2 py-1.5 rounded-lg text-left transition-colors ${
                        visible
                          ? 'bg-[var(--accent)]/12 text-[var(--ink)]'
                          : 'text-[var(--ink-muted)] opacity-50 hover:opacity-75 hover:bg-[var(--bg-elevated)]/40'
                      }`}
                    >
                      <span className="flex items-center gap-2 w-full">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: linkColor(rel, scheme) }}
                        />
                        <span className="flex-1 truncate">{displayRelationLabel(rel)}</span>
                        <span className="tabular-nums shrink-0">{cnt}</span>
                      </span>
                      <span className="graph-panel__legend-bar" aria-hidden>
                        <span
                          className="graph-panel__legend-bar-fill"
                          style={{
                            width: `${pct}%`,
                            background: linkColor(rel, scheme),
                          }}
                        />
                      </span>
                    </button>
                  </li>
                )
              })}
              {relationCounts.length === 0 && (
                <li className="text-[var(--ink-muted)] px-2">暂无关系边</li>
              )}
            </ul>
          </div>
          {selected && (
            <div className="graph-panel__detail p-2 rounded-lg border border-[var(--dashboard-panel-border)]">
              <div className="font-semibold text-[var(--ink)] mb-1">{selected.label}</div>
              <div className="text-[var(--ink-muted)] space-y-0.5">
                <div>类型：{selected.type}</div>
                {selected.community != null && selected.community >= 0 && (
                  <div>社区：{selected.community}</div>
                )}
                {selected.source_file && (
                  <div className="break-all" title={selected.source_file}>
                    文件：{selected.source_file.split(/[/\\]/).pop()}
                  </div>
                )}
                {selected.tags && selected.tags.length > 0 && (
                  <div>标签：{selected.tags.join(', ')}</div>
                )}
                <p className="text-[10px] pt-1 opacity-70">双击节点可局部探索</p>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
