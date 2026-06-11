import { useState } from 'react'
import type { Domain, Tag } from '../api/types'
import DomainChart from './DomainChart'

interface Props {
  domains: Domain[]
  tags: Tag[]
  animKey: number
  onSwitchToEditor: () => void
}

export default function KnowledgePanel({ domains, tags, animKey, onSwitchToEditor }: Props) {
  const [tab, setTab] = useState<'topic' | 'tag'>('topic')

  return (
    <div className="dashboard-panel-bubble dashboard-tile-enter h-full min-h-0 flex flex-col p-3 gap-2">
      <div className="flex items-center justify-between gap-2 shrink-0 flex-wrap border-b border-[var(--dashboard-table-border)] pb-2">
        <h3 className="dashboard-panel-title">知识分布</h3>
        <div className="flex gap-2 text-[11px]">
          <TabChip active={tab === 'topic'} onClick={() => setTab('topic')} label="Topic" />
          <TabChip active={tab === 'tag'} onClick={() => setTab('tag')} label="标签" />
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'topic' ? (
          <DomainChart
            key={`topic-${animKey}`}
            kind="topic"
            domains={domains}
            tags={[]}
            animKey={animKey}
            onSwitchToEditor={onSwitchToEditor}
          />
        ) : (
          <DomainChart
            key={`tag-${animKey}`}
            kind="tag"
            domains={[]}
            tags={tags}
            animKey={animKey}
          />
        )}
      </div>
    </div>
  )
}

function TabChip({
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
      className={`px-2 py-0.5 rounded transition-colors ${
        active
          ? 'text-[var(--ink)] font-semibold border-b-2 border-[var(--accent)]'
          : 'text-[var(--ink-muted)] opacity-70 hover:opacity-100'
      }`}
    >
      {label}
    </button>
  )
}
