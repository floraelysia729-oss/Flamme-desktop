import { useCallback, useMemo, useState } from 'react'
import { useChatScrollStore } from '../chatScrollStore'
import { parseQaBlocks } from './qaMessageLinks'
import { useLearnStore } from './store'

const QA_PLACEHOLDER = '（对话后将在此记录每轮问答摘要）'

interface Props {
  content: string
}

export default function QaSummariesView({ content }: Props) {
  const qaMessageLinks = useLearnStore((s) => s.qaMessageLinks)
  const getMessageIdxForRound = useLearnStore((s) => s.getMessageIdxForRound)
  const requestScrollToMessage = useChatScrollStore((s) => s.requestScrollToMessage)
  const [jumpHint, setJumpHint] = useState('')

  const blocks = useMemo(() => parseQaBlocks(content), [content])

  const handleJump = useCallback(
    (round: number) => {
      const idx = qaMessageLinks[round] ?? getMessageIdxForRound(round)
      if (idx === undefined) {
        setJumpHint('未找到对应对话')
        window.setTimeout(() => setJumpHint(''), 2500)
        return
      }
      setJumpHint('')
      requestScrollToMessage(idx)
    },
    [qaMessageLinks, getMessageIdxForRound, requestScrollToMessage],
  )

  const trimmed = (content || '').trim()
  if (!trimmed || trimmed === QA_PLACEHOLDER) {
    return <p className="text-[var(--ink-muted-on-glass,var(--ink-muted))]">（空）</p>
  }

  if (!blocks.length) {
    return <p className="text-[var(--ink-muted-on-glass,var(--ink-muted))]">{trimmed}</p>
  }

  return (
    <div className="qa-summaries-view">
      {blocks.map((block) => (
        <div key={block.round} className="qa-block">
          <p className="qa-round-header">
            <button
              type="button"
              className="qa-round-link"
              title="跳转到对应对话"
              onClick={() => handleJump(block.round)}
            >
              R{String(block.round).padStart(3, '0')}
            </button>
          </p>
          {block.question && (
            <p className="qa-field-line">
              <span className="qa-field-label">问题：</span>
              <button
                type="button"
                className="qa-question-link"
                title="跳转到对应对话"
                onClick={() => handleJump(block.round)}
              >
                {block.question}
              </button>
            </p>
          )}
          {block.principle && (
            <p className="qa-field-line">
              <span className="qa-field-label">原理：</span>
              {block.principle}
            </p>
          )}
          {block.misconception && (
            <p className="qa-field-line">
              <span className="qa-field-label">误区：</span>
              {block.misconception}
            </p>
          )}
        </div>
      ))}
      {jumpHint && <p className="qa-jump-hint">{jumpHint}</p>}
    </div>
  )
}
