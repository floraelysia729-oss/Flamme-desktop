import type { ReactNode } from 'react'

interface ZoneProps {
  children: ReactNode
  className?: string
}

function Zone({ children, className = '' }: ZoneProps) {
  return (
    <section className={`dashboard-zone min-h-0 flex flex-col ${className}`}>
      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
    </section>
  )
}

interface Props {
  overviewSlot: ReactNode
  heatmapSlot: ReactNode
  knowledgeSlot: ReactNode
  linksSlot: ReactNode
}

/** P2：上热力图大气泡，下：概览表 | 知识大气泡 | 跨域大气泡 */
export default function DashboardMosaic({
  overviewSlot,
  heatmapSlot,
  knowledgeSlot,
  linksSlot,
}: Props) {
  return (
    <div className="dashboard-p2 flex-1 min-h-0">
      <Zone className="dashboard-p2-heat">{heatmapSlot}</Zone>
      <div className="dashboard-p2-lower">
        <Zone>{overviewSlot}</Zone>
        <Zone className="dashboard-p2-knowledge">{knowledgeSlot}</Zone>
        <Zone>{linksSlot}</Zone>
      </div>
    </div>
  )
}
