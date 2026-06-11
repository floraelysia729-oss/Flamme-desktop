/** Learn 模式学习笔记状态机 — 与后端 learn_note JSON 对齐 */

export type LearnSectionId =
  | 'knowledge_tree'
  | 'qa_summaries'
  | 'types_and_conclusions'
  | 'learning_progress'

export type TreeNodeStatus = 'learned' | 'current' | 'todo' | 'branch'

export interface TreeNode {
  label: string
  status: TreeNodeStatus | null
  children: TreeNode[]
}

export interface LearnNoteSection {
  id: LearnSectionId
  content: string
  locked: boolean
}

export interface LearnNote {
  rootTopic: string
  sections: LearnNoteSection[]
  qaRound: number
  version: number
  updatedAt: string
  schema: 'learn_note_v1'
}

export interface EvidenceItem {
  path: string
  title: string
  excerpt: string
  content_hash?: string
  tool?: string
}

export interface ChatSessionMeta {
  session_id: string
  mode: 'learn' | 'search'
  title?: string
  updated_at?: string
  message_count?: number
  learn_note?: LearnNote
  evidence_pack?: EvidenceItem[]
  selected_files?: string[]
  archived_note_path?: string
  last_archived_at?: string
  last_archived_message_idx?: number
}

export const SECTION_TITLES: Record<LearnSectionId, string> = {
  knowledge_tree: '知识树',
  qa_summaries: '问答纪要',
  types_and_conclusions: '题型与结论',
  learning_progress: '学习进度',
}

/** @deprecated 仅用于旧会话迁移 */
export type ConceptStatus = 'new' | 'exploring' | 'understood' | 'gap'

/** @deprecated */
export interface LearnConcept {
  id: string
  label: string
  note: string
  parentId: string | null
  status: ConceptStatus
  sourcePaths?: string[]
}

/** @deprecated */
export interface LearnMind {
  topic: string
  concepts: LearnConcept[]
  links: { from: string; to: string; relation: string }[]
  openQuestions: string[]
  keyTakeaways: string[]
  version: number
  updatedAt: string
}
