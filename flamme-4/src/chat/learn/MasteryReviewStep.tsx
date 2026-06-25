import { useMemo } from 'react'
import { dedupeWrongEntries } from './masteryQuizUtils'
import type { MasteryWrongEntry } from './types'

interface Props {
  entries: MasteryWrongEntry[]
  onContinue: () => void
}

export default function MasteryReviewStep({ entries, onContinue }: Props) {
  const unique = useMemo(() => dedupeWrongEntries(entries), [entries])

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--ink-muted-on-glass,var(--ink-muted))]">
        本次测验共 {unique.length} 道错题，下课前可快速回顾：
      </p>
      <ul className="max-h-48 overflow-y-auto space-y-2 text-xs">
        {unique.map((e) => (
          <li
            key={`${e.targetLabel}:${e.question}`}
            className="rounded-lg border border-[var(--border)]/40 px-2 py-1.5 space-y-1"
          >
            <p className="font-medium text-[var(--ink-on-glass,var(--ink))]">
              [{e.targetLabel}] {e.question}
            </p>
            <p className="opacity-70">
              <span className="text-[var(--ink-muted)]">你的回答：</span>
              {e.userAnswer}
            </p>
            <p className="text-amber-200/90">
              <span className="text-[var(--ink-muted)]">解析：</span>
              {e.explanation}
            </p>
          </li>
        ))}
      </ul>
      <div className="flex justify-end pt-1">
        <button
          type="button"
          className="px-3 py-1.5 text-xs rounded-lg bg-[var(--accent)]/30 ring-1 ring-[var(--accent)]/50"
          onClick={onContinue}
        >
          去存档
        </button>
      </div>
    </div>
  )
}
