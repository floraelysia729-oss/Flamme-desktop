import { FileText, GitBranch, Link2, Flame } from 'lucide-react'
import type { OverviewResponse } from '../api/types'

interface Props {
  overview: OverviewResponse
  animKey: number
}

export default function DashboardOverview({ overview, animKey }: Props) {
  const rows: { icon: typeof FileText; label: string; value: string }[][] = [
    [
      { icon: FileText, label: '文档', value: String(overview.total_docs) },
      { icon: GitBranch, label: '实体', value: String(overview.total_entities) },
    ],
    [
      { icon: Link2, label: '关系', value: String(overview.total_relations) },
      { icon: Flame, label: '连续活跃', value: `${overview.streak} 天` },
    ],
    [
      { icon: Flame, label: '本周活动', value: `${overview.week_activity} 次` },
      { icon: GitBranch, label: 'Topic', value: `${overview.domains.length} 个` },
    ],
  ]

  return (
    <div
      key={animKey}
      className="dashboard-panel-bubble dashboard-tile-enter h-full min-h-0 flex flex-col p-3 gap-2"
    >
      <h3 className="dashboard-panel-title">数据概览</h3>
      <table className="dashboard-stats-table flex-1">
        <tbody>
          {rows.map((pair, ri) => (
            <tr key={ri}>
              {pair.map((cell) => {
                const Icon = cell.icon
                return (
                  <td key={cell.label} className="dashboard-stats-cell">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Icon size={12} className="text-[var(--ink-muted)] shrink-0 opacity-65" />
                      <span className="dashboard-stats-label truncate">{cell.label}</span>
                      <span className="dashboard-stats-value tabular-nums">{cell.value}</span>
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
