import type { MasteryWrongEntry } from './types'

/** 按「知识点 + 题目」去重，保留最后一次作答记录 */
export function dedupeWrongEntries(entries: MasteryWrongEntry[]): MasteryWrongEntry[] {
  const map = new Map<string, MasteryWrongEntry>()
  for (const e of entries) {
    map.set(`${e.targetLabel}\0${e.question}`, e)
  }
  return [...map.values()]
}
