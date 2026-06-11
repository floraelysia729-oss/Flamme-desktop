import type { LearnNote, LearnSectionId } from './types'
import { SECTION_TITLES } from './types'
import { emptyLearnNote } from './noteTemplate'
import { normalizeLearnNote } from './migrateLearnMind'

const SECTION_ORDER: LearnSectionId[] = [
  'knowledge_tree',
  'qa_summaries',
  'types_and_conclusions',
  'learning_progress',
]

const H1_TO_ID: Record<string, LearnSectionId> = {
  知识树: 'knowledge_tree',
  问答纪要: 'qa_summaries',
  题型与结论: 'types_and_conclusions',
  学习进度: 'learning_progress',
}

export interface ParsedArchivedNote {
  frontmatter: Record<string, string | number | string[]>
  note: LearnNote
  dialogueBody: string
}

function parseFrontmatter(raw: string): { fm: Record<string, unknown>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match) return { fm: {}, body: raw }
  const fm: Record<string, unknown> = {}
  for (const line of match[1].split('\n')) {
    const m = line.match(/^(\w+):\s*(.*)$/)
    if (!m) continue
    let val: string | unknown = m[2].trim()
    if (typeof val === 'string' && val.startsWith('[') && val.endsWith(']')) {
      try {
        val = JSON.parse(val.replace(/'/g, '"'))
      } catch {
        val = m[2].trim()
      }
    } else if (typeof val === 'string' && val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1)
    }
    fm[m[1]] = val
  }
  return { fm, body: match[2] }
}

export function parseLearnNoteMarkdown(body: string, rootTopic?: string): LearnNote {
  const base = emptyLearnNote(rootTopic ?? '未命名学习')
  const dialogueIdx = body.indexOf('## 对话记录')
  const main = dialogueIdx >= 0 ? body.slice(0, dialogueIdx) : body

  const parts = main.split(/^# /m).filter(Boolean)
  for (const part of parts) {
    const nl = part.indexOf('\n')
    const title = (nl >= 0 ? part.slice(0, nl) : part).trim()
    const content = (nl >= 0 ? part.slice(nl + 1) : '').trim()
    const id = H1_TO_ID[title]
    if (!id) continue
    const sec = base.sections.find((s) => s.id === id)
    if (sec) sec.content = content
  }
  return base
}

export function toMarkdown(note: LearnNote): string {
  return SECTION_ORDER.map((id) => {
    const sec = note.sections.find((s) => s.id === id)
    const title = SECTION_TITLES[id]
    return `# ${title}\n\n${sec?.content?.trim() || ''}`
  }).join('\n\n')
}

export function parseArchivedNote(content: string): ParsedArchivedNote {
  const { fm, body } = parseFrontmatter(content)
  const topic = String(fm.topic ?? fm.title ?? '未命名学习')
  const dialogueIdx = body.indexOf('## 对话记录')
  const dialogueBody = dialogueIdx >= 0 ? body.slice(dialogueIdx) : ''
  const note = parseLearnNoteMarkdown(body, topic)
  note.rootTopic = topic
  return {
    frontmatter: fm as Record<string, string | number | string[]>,
    note,
    dialogueBody,
  }
}

export { normalizeLearnNote }
