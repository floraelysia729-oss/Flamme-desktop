import { Check, Loader2, Minus, X as XIcon } from 'lucide-react'
import type { IngestStage } from '../api/types'

interface Props {
  stages: IngestStage[]
  compact?: boolean
}

const statusIcon = (status: IngestStage['status']) => {
  switch (status) {
    case 'running':
      return <Loader2 size={10} className="animate-spin text-[var(--accent)] shrink-0" />
    case 'ok':
      return <Check size={10} className="text-[var(--success)] shrink-0" />
    case 'failed':
      return <XIcon size={10} className="text-[var(--danger)] shrink-0" />
    case 'skipped':
      return <Minus size={10} className="text-[var(--ink-muted)] shrink-0" />
    default:
      return <span className="w-2.5 h-2.5 rounded-full border border-white/20 shrink-0" />
  }
}

export default function IngestStageList({ stages, compact }: Props) {
  if (!stages.length) return null
  return (
    <ul className={`space-y-0.5 ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
      {stages.map((s) => (
        <li key={s.id} className="flex items-center gap-1.5 text-[var(--ink-muted)]">
          {statusIcon(s.status)}
          <span className={s.status === 'running' ? 'text-[var(--ink)]' : ''}>{s.label}</span>
          {s.detail && (
            <span className="truncate opacity-70" title={s.detail}>
              · {s.detail}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}
