/** 从助手回复末尾解析 SUGGESTIONS JSON（学习模式追问） */
export function extractSuggestionQuestions(text: string): {
  questions: string[]
  cleanText: string
} {
  const match = text.match(
    /(?:^|\n)\s*(?:\*\*)?(?:__)?SUGGESTIONS(?:__)?(?:\*\*)?\s*[:：]\s*(\[[\s\S]*?\])\s*$/i,
  )
  if (!match) return { questions: [], cleanText: text }

  try {
    const normalized = match[1]
      .replace(/["\u201C\u201D]/g, '"')
      .replace(/['\u2018\u2019]/g, "'")
    const parsed = JSON.parse(normalized) as unknown
    if (Array.isArray(parsed)) {
      const questions = parsed.filter(
        (item): item is string => typeof item === 'string' && item.trim().length > 0,
      )
      if (questions.length > 0) {
        return {
          questions,
          cleanText: text.slice(0, match.index).trim(),
        }
      }
    }
  } catch {
    /* keep original */
  }

  return { questions: [], cleanText: text }
}
