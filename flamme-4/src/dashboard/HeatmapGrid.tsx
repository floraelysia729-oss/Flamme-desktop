import { useMemo } from 'react'
import type { HeatmapEntry } from '../api/types'

interface Props {
  data: HeatmapEntry[]
  streak: number
  weekActivity: number
  animKey: number
}

const WEEKS = 53
const CELL = 12
const GAP = 2
const HEAT_COLOR = 'var(--dashboard-heat-color, var(--theme-c2, var(--accent-warm)))'
const HEAT_COLOR_HIGH =
  'var(--dashboard-heat-color-high, var(--dashboard-heat-color, var(--theme-c4, var(--accent-warm))))'
const HEAT_EMPTY_ALPHA = 0.1
const HEAT_LEGEND_FRACTIONS = [0, 0.25, 0.5, 0.75, 1] as const
const ROW_LABELS = [
  { row: 1, label: '一' },
  { row: 3, label: '三' },
  { row: 5, label: '五' },
]
const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

function formatLocalDate(d: Date): string {
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** 对数映射 0‥1，使 1 / 10 / 100 / 300 等同日量级可区分 */
function heatIntensity(count: number, dataMax: number): number {
  if (count <= 0) return 0
  return Math.log10(count + 1) / Math.log10(dataMax + 1)
}

function heatAlpha(count: number, dataMax: number): number {
  if (count === 0) return HEAT_EMPTY_ALPHA
  const t = heatIntensity(count, dataMax)
  return 0.34 + t * 0.62
}

function oklchHeat(base: string, alpha: number): string {
  return `oklch(from ${base} l c h / ${alpha})`
}

function getColor(count: number, dataMax: number): string {
  const alpha = heatAlpha(count, dataMax)
  if (count === 0) return oklchHeat(HEAT_COLOR, HEAT_EMPTY_ALPHA)

  const t = heatIntensity(count, dataMax)
  const base = oklchHeat(HEAT_COLOR, alpha)
  if (t < 0.68) return base

  const mix = ((t - 0.68) / 0.32) * 100
  const high = oklchHeat(HEAT_COLOR_HIGH, alpha)
  return `color-mix(in oklch, ${base} ${100 - mix}%, ${high} ${mix}%)`
}

function countForLegendFraction(fraction: number, dataMax: number): number {
  if (fraction <= 0) return 0
  return Math.max(1, Math.round(10 ** (fraction * Math.log10(dataMax + 1)) - 1))
}

export default function HeatmapGrid({ data, streak, weekActivity, animKey }: Props) {
  const byDate = useMemo(() => new Map(data.map((d) => [d.date, d.count])), [data])

  const { cells, monthTicks, stats } = useMemo(() => {
    const today = new Date()
    const out: { date: string; count: number; col: number; row: number }[] = []

    for (let w = WEEKS - 1; w >= 0; w--) {
      for (let d = 0; d < 7; d++) {
        const cellDate = new Date(today)
        cellDate.setDate(cellDate.getDate() - (w * 7 + ((today.getDay() - d + 7) % 7)))
        const ds = formatLocalDate(cellDate)
        out.push({ date: ds, count: byDate.get(ds) ?? 0, col: WEEKS - 1 - w, row: d })
      }
    }

    const ticks: { col: number; label: string }[] = []
    let lastMonth = -1
    for (let col = 0; col < WEEKS; col++) {
      const sample = out.find((c) => c.col === col)
      if (!sample) continue
      const m = parseInt(sample.date.slice(5, 7), 10) - 1
      if (m !== lastMonth) {
        lastMonth = m
        ticks.push({ col, label: MONTH_LABELS[m] ?? '' })
      }
    }

    let bestDay = { date: '—', count: 0 }
    let bestMonth = { key: '—', count: 0 }
    const monthCounts = new Map<string, number>()
    for (const [date, count] of byDate) {
      if (count > bestDay.count) bestDay = { date, count }
      const mk = date.slice(0, 7)
      const mc = (monthCounts.get(mk) ?? 0) + count
      monthCounts.set(mk, mc)
      if (mc > bestMonth.count) {
        bestMonth = { key: mk, count: mc }
      }
    }
    const bestMonthLabel = bestMonth.key !== '—' ? `${parseInt(bestMonth.key.slice(5, 7), 10)}月` : '—'

    return { cells: out, monthTicks: ticks, stats: { bestDay, bestMonthLabel } }
  }, [byDate])

  const dataMax = useMemo(
    () => Math.max(1, ...cells.map((c) => c.count)),
    [cells],
  )

  const labelW = 14
  const topH = 12
  const gridW = WEEKS * (CELL + GAP)
  const gridH = 7 * (CELL + GAP)
  const svgW = labelW + gridW
  const svgH = topH + gridH

  const yearTotal = data.reduce((s, d) => s + d.count, 0)

  return (
    <div
      key={animKey}
      className="dashboard-heat-panel dashboard-tile-enter flex flex-col h-full min-h-0 gap-2"
    >
      <div className="flex items-baseline justify-between gap-3 shrink-0 flex-wrap">
        <div>
          <h3 className="dashboard-panel-title">活动热力</h3>
          <p className="text-xl font-semibold text-[var(--ink)] tabular-nums mt-1">
            {yearTotal}
            <span className="text-xs font-normal text-[var(--ink-muted)] ml-1.5">近一年</span>
          </p>
        </div>
        <div className="flex items-center gap-1 text-[9px] text-[var(--ink-muted)] opacity-70">
          <span>少</span>
          {HEAT_LEGEND_FRACTIONS.map((fraction) => (
            <span
              key={fraction}
              className="inline-block rounded-sm"
              style={{
                width: 10,
                height: 10,
                background: getColor(countForLegendFraction(fraction, dataMax), dataMax),
              }}
              title={
                fraction === 0
                  ? '0 次'
                  : `${countForLegendFraction(fraction, dataMax)} 次`
              }
            />
          ))}
          <span>多</span>
        </div>
      </div>

      <div className="dashboard-heat-grid-wrap flex-1 min-h-0 w-full">
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="dashboard-heat-svg"
          preserveAspectRatio="xMidYMid meet"
        >
          {monthTicks.map((t) => (
            <text
              key={`${t.col}-${t.label}`}
              x={labelW + t.col * (CELL + GAP)}
              y={9}
              className="fill-[var(--ink-muted)]"
              style={{ fontSize: 8, opacity: 0.5 }}
            >
              {t.label}
            </text>
          ))}
          {ROW_LABELS.map(({ row, label }) => (
            <text
              key={label}
              x={2}
              y={topH + row * (CELL + GAP) + CELL - 2}
              className="fill-[var(--ink-muted)]"
              style={{ fontSize: 8, opacity: 0.55 }}
            >
              {label}
            </text>
          ))}
          {cells.map((c) => (
            <rect
              key={c.date}
              x={labelW + c.col * (CELL + GAP)}
              y={topH + c.row * (CELL + GAP)}
              width={CELL}
              height={CELL}
              rx={2}
              fill={getColor(c.count, dataMax)}
              className="dashboard-heat-cell"
            >
              <title>{c.date}: {c.count} 次</title>
            </rect>
          ))}
        </svg>
      </div>

      <table className="dashboard-stats-table dashboard-heat-stats-row shrink-0">
        <tbody>
          <tr>
            <td className="dashboard-stats-cell">
              <span className="dashboard-stats-label">连续活跃</span>
              <span className="dashboard-stats-value">{streak} 天</span>
            </td>
            <td className="dashboard-stats-cell">
              <span className="dashboard-stats-label">本周活动</span>
              <span className="dashboard-stats-value">{weekActivity} 次</span>
            </td>
            <td className="dashboard-stats-cell">
              <span className="dashboard-stats-label">最活跃日</span>
              <span className="dashboard-stats-value">{stats.bestDay.date}</span>
            </td>
            <td className="dashboard-stats-cell">
              <span className="dashboard-stats-label">最活跃月</span>
              <span className="dashboard-stats-value">{stats.bestMonthLabel}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
