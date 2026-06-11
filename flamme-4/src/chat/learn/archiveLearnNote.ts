import { writeVaultFile, patchChatSession } from '../../api/bridge'
import { useConnectionStore } from '../../api/connection'
import type { LearnNote } from './types'
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

function buildArchiveBody(
  note: LearnNote,
  sessionId: string,
  sources: string[],
  notePath: string,
  createdDate: string,
): string {
  const sourcesYaml = JSON.stringify(sources)

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
`
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
}): Promise<ArchiveResult> {
  const dir = useConnectionStore.getState().learnNotesDir || '学习笔记'
  const topic = sanitizeTopic(opts.note.rootTopic)
  const created = todayStr()

  if (!opts.archivedNotePath) {
    const path = `${dir}/${created}-${topic}.md`.replace(/\\/g, '/')
    const content = buildArchiveBody(
      opts.note,
      opts.sessionId,
      opts.selectedFiles,
      path,
      created,
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
