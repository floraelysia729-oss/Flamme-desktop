import { extractSuggestionQuestions } from './markdown'

/** 将助手 Markdown 粗略转为纯文本（用于复制） */
export function markdownToPlainText(md: string): string {
  const { cleanText } = extractSuggestionQuestions(md)
  return cleanText
    .replace(/```[\s\S]*?```/g, (block) => {
      const inner = block.replace(/^```[^\n]*\n?/, '').replace(/```$/, '')
      return inner.trim() ? `${inner.trim()}\n` : ''
    })
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function copyMessageText(
  content: string,
  mode: 'md' | 'plain',
  asMarkdown = false,
): Promise<void> {
  const text =
    mode === 'md' || !asMarkdown ? content : markdownToPlainText(content)
  await navigator.clipboard.writeText(text)
}
