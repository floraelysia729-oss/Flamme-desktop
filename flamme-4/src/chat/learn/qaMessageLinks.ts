import type { ChatMessage } from '../types'

export interface QaBlock {
  round: number
  question: string
  principle: string
  misconception: string | null
}

const QA_PLACEHOLDER = '（对话后将在此记录每轮问答摘要）'

const LOW_SIGNAL_USER =
  /^[\s\u3000]*(好的?|好|嗯+|哦+|行|可以|继续|谢谢|感谢|ok|okay|yes|no|明白了?|懂了|知道了|收到|然后呢|还有吗)[\s\u3000。!！?？~～…]*$/i

const UNDERSTOOD_SIGNAL = /懂了|明白了|理解了|清楚了|会了|get\s*it|明白了/i
const GAP_SIGNAL = /不懂|不明白|没懂|困惑|糊涂|看不懂|不理解|还是不懂|不太懂/i
const QUESTION_SIGNAL = /[?？]|什么|为什么|怎么|如何|能否|是不是|吗/

const ROUND_HEADER = /^###\s+R(\d{3})(?:\s*[（(].*[)）])?\s*$/m
const FIELD_QUESTION = /^\*\*问题\*\*[：:]\s*(.+)$/m
const FIELD_PRINCIPLE = /^\*\*原理\*\*[：:]\s*(.+)$/m
const FIELD_MISCONCEPTION = /^\*\*误区\*\*[：:]\s*(.+)$/m

/** 本轮是否有值得写入学习笔记的信号（与后端 learn_mind.has_learning_signal 对齐） */
export function hasLearningSignal(userMsg: string, assistantMsg: string): boolean {
  const user = (userMsg || '').trim()
  const assistant = (assistantMsg || '').trim()

  if (!user && !assistant) return false

  if (user && LOW_SIGNAL_USER.test(user) && assistant.length < 80) return false

  if (GAP_SIGNAL.test(user) || UNDERSTOOD_SIGNAL.test(user)) return true
  if (QUESTION_SIGNAL.test(user)) return true
  if (user.length >= 8) return true
  if (assistant.length >= 60) return true
  return false
}

/** 解析问答纪要 markdown 为块列表 */
export function parseQaBlocks(content: string): QaBlock[] {
  const body = (content || '').trim()
  if (!body || body === QA_PLACEHOLDER) return []

  const blocks: QaBlock[] = []
  const parts = body.split(/^###\s+R(\d{3})/m).filter(Boolean)

  for (let i = 0; i < parts.length; i += 2) {
    const roundStr = parts[i]
    const blockBody = parts[i + 1] ?? ''
    const round = parseInt(roundStr, 10)
    if (!Number.isFinite(round)) continue

    const qMatch = blockBody.match(FIELD_QUESTION)
    const pMatch = blockBody.match(FIELD_PRINCIPLE)
    const mMatch = blockBody.match(FIELD_MISCONCEPTION)

    blocks.push({
      round,
      question: qMatch?.[1]?.trim() ?? '',
      principle: pMatch?.[1]?.trim() ?? '',
      misconception: mMatch?.[1]?.trim() ?? null,
    })
  }

  return blocks
}

export function formatQaBlock(block: QaBlock): string {
  const lines = [`### R${String(block.round).padStart(3, '0')}`]
  if (block.question) lines.push(`**问题**：${block.question}`)
  if (block.principle) lines.push(`**原理**：${block.principle}`)
  if (block.misconception) lines.push(`**误区**：${block.misconception}`)
  return lines.join('\n')
}

export function formatQaBlocks(blocks: QaBlock[]): string {
  if (!blocks.length) return QA_PLACEHOLDER
  return [...blocks]
    .sort((a, b) => b.round - a.round)
    .map(formatQaBlock)
    .join('\n\n')
}

export function countLearningTurns(messages: ChatMessage[]): number {
  let count = 0
  for (let i = 0; i < messages.length - 1; i += 2) {
    const user = messages[i]
    const assistant = messages[i + 1]
    if (user?.role !== 'user' || assistant?.role !== 'assistant') continue
    if (hasLearningSignal(user.content, assistant.content)) count++
  }
  return count
}

/** 按消息历史与学习信号重建 round → userMessageIdx 映射 */
export function rebuildQaMessageLinks(
  messages: ChatMessage[],
  qaContent: string,
): Record<number, number> {
  const blocks = parseQaBlocks(qaContent)
  if (!blocks.length) return {}

  const roundsAsc = [...blocks].map((b) => b.round).sort((a, b) => a - b)
  const links: Record<number, number> = {}
  let roundIdx = 0

  for (let i = 0; i < messages.length - 1; i += 2) {
    const user = messages[i]
    const assistant = messages[i + 1]
    if (user?.role !== 'user' || assistant?.role !== 'assistant') continue
    if (!hasLearningSignal(user.content, assistant.content)) continue
    if (roundIdx >= roundsAsc.length) break

    links[roundsAsc[roundIdx]] = i
    roundIdx++
  }

  return links
}

export function getQaSummariesContent(
  sections: { id: string; content: string }[],
): string {
  return sections.find((s) => s.id === 'qa_summaries')?.content ?? ''
}
