import type { DomainLink } from '../api/types'
import DomainBridgePanel from './DomainBridgePanel'

interface Props {
  links: DomainLink[]
  animKey: number
  onSwitchToEditor: () => void
}

export default function DomainLinksTile({ links, animKey, onSwitchToEditor }: Props) {
  return (
    <div
      key={animKey}
      className="dashboard-panel-bubble dashboard-tile-enter h-full min-h-0 flex flex-col p-3 gap-2"
    >
      <h3 className="dashboard-panel-title shrink-0">跨域连接</h3>
      {!links.length ? (
        <p className="text-xs text-[var(--ink-muted)] opacity-60 text-center py-6 leading-relaxed flex-1">
          暂无跨域桥接。重建图谱与 Topic 后，不同主题之间的关联会显示在这里。
        </p>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <DomainBridgePanel links={links} onSwitchToEditor={onSwitchToEditor} />
        </div>
      )}
    </div>
  )
}
