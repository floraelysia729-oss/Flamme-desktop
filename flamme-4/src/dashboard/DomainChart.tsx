import { useMemo, useState } from 'react'
import type { Domain, Tag } from '../api/types'
import { openTopicDocument } from './openTopic'

export type ChartMode = 'pie' | 'bar'
export type ChartDimension = 'domains' | 'tags'

interface Slice {
  id: string
  label: string
  value: number
  topic_path?: string
}

interface Props {
  kind: 'topic' | 'tag'
  domains: Domain[]
  tags: Tag[]
  animKey: number
  onSwitchToEditor?: () => void
}

const PALETTE = [
  'var(--theme-c1, var(--accent))',
  'var(--theme-c2, var(--accent-warm))',
  'oklch(from var(--theme-c1, var(--accent)) l c h / 0.75)',
  'oklch(from var(--theme-c2, var(--accent-warm)) l c h / 0.75)',
  'oklch(from var(--theme-c1, var(--accent)) l c h / 0.5)',
  'oklch(from var(--theme-c2, var(--accent-warm)) l c h / 0.5)',
]

const CX = 100
const CY = 100
const R0 = 48
const R1 = 88

function buildSlices(domains: Domain[], tags: Tag[], dimension: ChartDimension): Slice[] {
  if (dimension === 'tags') {
    return tags.map((t) => ({
      id: `tag-${t.name}`,
      label: t.name,
      value: t.count,
    }))
  }
  return domains
    .filter((d) => Boolean(d.topic_path?.trim()))
    .map((d) => ({
      id: `dom-${d.community_id}`,
      label: d.name,
      value: d.entity_count,
      topic_path: d.topic_path,
    }))
}

function arcPath(r0: number, r1: number, a0: number, a1: number): string {
  const x0o = CX + r1 * Math.cos(a0)
  const y0o = CY + r1 * Math.sin(a0)
  const x1o = CX + r1 * Math.cos(a1)
  const y1o = CY + r1 * Math.sin(a1)
  const x1i = CX + r0 * Math.cos(a1)
  const y1i = CY + r0 * Math.sin(a1)
  const x0i = CX + r0 * Math.cos(a0)
  const y0i = CY + r0 * Math.sin(a0)
  const large = a1 - a0 > Math.PI ? 1 : 0
  return [
    `M ${x0o} ${y0o}`,
    `A ${r1} ${r1} 0 ${large} 1 ${x1o} ${y1o}`,
    `L ${x1i} ${y1i}`,
    `A ${r0} ${r0} 0 ${large} 0 ${x0i} ${y0i}`,
    'Z',
  ].join(' ')
}

export default function DomainChart({ kind, domains, tags, animKey, onSwitchToEditor }: Props) {
  const [mode, setMode] = useState<ChartMode>('pie')
  const dimension: ChartDimension = kind === 'topic' ? 'domains' : 'tags'
  const clickable = kind === 'topic'

  const slices = useMemo(
    () => buildSlices(domains, tags, dimension),
    [domains, tags, dimension],
  )
  const valueTotal = slices.reduce((s, x) => s + x.value, 0) || 1
  const sliceCount = slices.length
  const maxVal = Math.max(1, ...slices.map((s) => s.value))

  const openSlice = (sl: Slice) => {
    if (!clickable || !onSwitchToEditor) return
    void openTopicDocument(sl.topic_path, sl.label, onSwitchToEditor)
  }

  const pieSegments = useMemo(() => {
    let angle = -Math.PI / 2
    return slices.map((sl, i) => {
      const sweep = (sl.value / valueTotal) * Math.PI * 2
      const a0 = angle
      const a1 = angle + sweep
      angle = a1
      const mid = (a0 + a1) / 2
      return {
        sl,
        i,
        d: arcPath(R0, R1, a0, a1),
        lx: CX + 62 * Math.cos(mid),
        ly: CY + 62 * Math.sin(mid),
      }
    })
  }, [slices, valueTotal])

  if (!slices.length) {
    return (
      <p className="text-xs text-[var(--ink-muted)] opacity-50 text-center py-8">
        {kind === 'topic' ? '暂无主题，请先重建图谱与 Topic' : '暂无标签'}
      </p>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex justify-end gap-2 shrink-0 mb-2 flex-wrap text-[11px] border-b border-[var(--dashboard-table-border)] pb-1.5">
        <span className="text-[var(--ink-muted)] opacity-60 self-center mr-1">图表</span>
        <ToggleChip active={mode === 'pie'} onClick={() => setMode('pie')} label="环形" />
        <ToggleChip active={mode === 'bar'} onClick={() => setMode('bar')} label="柱状" />
      </div>

      <div className="flex-1 min-h-0 flex gap-3 items-stretch">
        {mode === 'pie' ? (
          <div className="w-[52%] max-w-[240px] shrink-0 flex items-center justify-center min-h-0">
            <svg viewBox="0 0 200 200" className="w-full h-full max-h-[min(100%,220px)] aspect-square">
              {pieSegments.map(({ sl, i, d, lx, ly }) => (
                <g
                  key={sl.id}
                  className="dashboard-slice-enter"
                  style={{ animationDelay: `${i * 50}ms`, transformOrigin: `${CX}px ${CY}px` }}
                >
                  <path
                    d={d}
                    fill={PALETTE[i % PALETTE.length]}
                    className={`${clickable && sl.topic_path ? 'cursor-pointer' : ''} opacity-90 hover:opacity-100 transition-opacity`}
                    onClick={() => clickable && openSlice(sl)}
                  >
                    <title>
                      {sl.label}: {sl.value}
                      {sl.topic_path ? '（点击打开）' : ''}
                    </title>
                  </path>
                  {sl.value / valueTotal > 0.05 && (
                    <text
                      x={lx}
                      y={ly}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="fill-[var(--ink)] pointer-events-none"
                      style={{ fontSize: 9 }}
                    >
                      {sl.label.length > 5 ? `${sl.label.slice(0, 4)}…` : sl.label}
                    </text>
                  )}
                </g>
              ))}
              <text x={CX} y={CY - 4} textAnchor="middle" className="fill-[var(--ink-muted)]" style={{ fontSize: 11 }}>
                {kind === 'topic' ? 'Topic' : '标签'}
              </text>
              <text x={CX} y={CY + 12} textAnchor="middle" className="fill-[var(--ink)] font-semibold" style={{ fontSize: 14 }}>
                {sliceCount}
              </text>
            </svg>
          </div>
        ) : (
          <div className="w-[52%] max-w-[200px] shrink-0 flex flex-col justify-center gap-1.5 py-1 min-h-0 overflow-hidden">
            {slices.map((sl, i) => (
              <button
                key={sl.id}
                type="button"
                disabled={!clickable}
                onClick={() => openSlice(sl)}
                className={`w-full text-left ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
                title={sl.label}
              >
                <div
                  className="h-2.5 rounded-full dashboard-bar-grow"
                  style={{
                    width: `${(sl.value / maxVal) * 100}%`,
                    background: PALETTE[i % PALETTE.length],
                    transitionDelay: `${i * 40}ms`,
                  }}
                />
              </button>
            ))}
          </div>
        )}

        <div className="dashboard-rank-scroll flex-1 min-w-0 min-h-0">
          <table className="dashboard-rank-table">
            <tbody>
              {slices.map((sl, i) => (
                <tr key={sl.id}>
                  <td className="dashboard-rank-cell w-4">
                    <span
                      className="inline-block w-2 h-2 rounded-full shrink-0"
                      style={{ background: PALETTE[i % PALETTE.length] }}
                    />
                  </td>
                  <td className="dashboard-rank-cell min-w-0">
                    <button
                      type="button"
                      disabled={!clickable || !sl.topic_path}
                      onClick={() => openSlice(sl)}
                      className={`w-full text-left text-xs text-[var(--ink)] truncate ${
                        clickable && sl.topic_path
                          ? 'cursor-pointer hover:underline'
                          : 'cursor-default opacity-85'
                      }`}
                    >
                      {sl.label}
                    </button>
                  </td>
                  <td className="dashboard-rank-cell text-right tabular-nums text-xs text-[var(--ink-muted)] w-10">
                    {sl.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function ToggleChip({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-1 py-0.5 text-[11px] transition-colors ${
        active ? 'text-[var(--ink)] font-medium' : 'text-[var(--ink-muted)] opacity-70 hover:opacity-100'
      }`}
    >
      {label}
    </button>
  )
}
