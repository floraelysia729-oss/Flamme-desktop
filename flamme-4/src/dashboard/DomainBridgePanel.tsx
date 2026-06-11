import type { DomainLink } from '../api/types'
import { openTopicDocument } from './openTopic'

interface Props {
  links: DomainLink[]
  onSwitchToEditor: () => void
}

export default function DomainBridgePanel({ links, onSwitchToEditor }: Props) {
  if (!links.length) return null

  return (
    <table className="dashboard-links-table w-full">
      <tbody>
        {links.map((link) => {
          const key = `${link.source_cid}-${link.target_cid}`
          const bridges = (link.bridge_entities ?? []).slice(0, 4).join(' · ')
          return (
            <tr key={key}>
              <td className="dashboard-links-cell">
                <div className="flex flex-wrap items-center gap-1 text-[var(--ink)] text-xs">
                  <button
                    type="button"
                    className="font-medium hover:underline"
                    style={{ color: 'var(--theme-c1, var(--accent))' }}
                    onClick={() =>
                      void openTopicDocument(link.source_topic_path, link.source_name, onSwitchToEditor)
                    }
                  >
                    {link.source_name}
                  </button>
                  <span className="text-[var(--ink-muted)] opacity-60">↔</span>
                  <button
                    type="button"
                    className="font-medium hover:underline"
                    style={{ color: 'var(--theme-c2, var(--accent))' }}
                    onClick={() =>
                      void openTopicDocument(link.target_topic_path, link.target_name, onSwitchToEditor)
                    }
                  >
                    {link.target_name}
                  </button>
                  {link.weight > 0 && (
                    <span className="text-[10px] text-[var(--ink-muted)] ml-auto tabular-nums shrink-0">
                      {link.weight} 桥
                    </span>
                  )}
                </div>
                {bridges && (
                  <p className="mt-1 text-[10px] text-[var(--ink-muted)] truncate" title={bridges}>
                    桥接: {bridges}
                  </p>
                )}
                {link.insight && (
                  <p className="mt-0.5 text-[10px] text-[var(--ink-muted)] opacity-80 leading-relaxed">
                    {link.insight}
                  </p>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
