import { writeVaultFile, patchChatSession } from '../../api/bridge'
import { useConnectionStore } from '../../api/connection'
import type { LearnNote, MasteryWrongEntry } from './types'
import { dedupeWrongEntries } from './masteryQuizUtils'
import { toMarkdown } from './parseLearnNote'

function sanitizeTopic(topic: string): string {
  return topic
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 40) || '未命名学习'
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

/** 下课存档时追加错题回顾章节（可单测） */
export function formatWrongLogSection(entries: MasteryWrongEntry[]): string {
  const unique = dedupeWrongEntries(entries)
  if (!unique.length) return ''
  const lines = ['## 错题回顾', '']
  for (const e of unique) {
    lines.push(`### ${e.targetLabel}`, '')
    lines.push(`**题目**：${e.question}`, '')
    lines.push(`**你的回答**：${e.userAnswer}`, '')
    lines.push(`**解析**：${e.explanation}`, '')
    lines.push('')
  }
  return lines.join('\n')
}

function buildArchiveBody(
  note: LearnNote,
  sessionId: string,
  sources: string[],
  notePath: string,
  createdDate: string,
  wrongLog: MasteryWrongEntry[] = [],
): string {
  const sourcesYaml = JSON.stringify(sources)
  const wrongSection = formatWrongLogSection(wrongLog)

  return `---
type: learn-session
date: ${createdDate}
updated: ${todayStr()}
topic: ${note.rootTopic}
sources: ${sourcesYaml}
session_id: ${sessionId}
flamme_note_version: ${note.version}
archived_note_path: ${notePath}
---

${toMarkdown(note)}
${wrongSection ? `\n${wrongSection}` : ''}`
}

export interface ArchiveResult {
  path: string
  isUpdate: boolean
}

export async function archiveLearnNote(opts: {
  note: LearnNote
  sessionId: string
  selectedFiles: string[]
  archivedNotePath: string | null
  wrongLog?: MasteryWrongEntry[]
}): Promise<ArchiveResult> {
  const dir = useConnectionStore.getState().learnNotesDir || '学习笔记'
  const topic = sanitizeTopic(opts.note.rootTopic)
  const created = todayStr()
  const wrongLog = opts.wrongLog ?? []

  if (!opts.archivedNotePath) {
    const path = `${dir}/${created}-${topic}.md`.replace(/\\/g, '/')
    const content = buildArchiveBody(
      opts.note,
      opts.sessionId,
      opts.selectedFiles,
      path,
      created,
      wrongLog,
    )
    await writeVaultFile(path, content)
    await patchChatSession(opts.sessionId, {
      archived_note_path: path,
      last_archived_at: new Date().toISOString(),
      title: opts.note.rootTopic,
    })
    return { path, isUpdate: false }
  }

  const path = opts.archivedNotePath.replace(/\\/g, '/')
  const content = buildArchiveBody(
    opts.note,
    opts.sessionId,
    opts.selectedFiles,
    path,
    created,
    wrongLog,
  )

  await writeVaultFile(path, content)
  await patchChatSession(opts.sessionId, {
    archived_note_path: path,
    last_archived_at: new Date().toISOString(),
    title: opts.note.rootTopic,
  })
  return { path, isUpdate: true }
}

export function previewArchivePath(note: LearnNote, archivedPath: string | null): string {
  if (archivedPath) return archivedPath.replace(/\\/g, '/')
  const dir = useConnectionStore.getState().learnNotesDir || '学习笔记'
  return `${dir}/${todayStr()}-${sanitizeTopic(note.rootTopic)}.md`.replace(/\\/g, '/')
}
