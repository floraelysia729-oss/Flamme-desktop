/** 与 flamme-backend POST /api/chat 及 SSE 事件对齐 */

export type ChatMode = 'search' | 'learn'

export type ToolStatusState = 'running' | 'progress' | 'done'

export interface ToolStatus {
  name: string
  label?: string
  status: ToolStatusState
  estimate?: string
  elapsed?: number
  message?: string
  files?: string[]
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  toolCalls?: string[]
  toolStatus?: ToolStatus[]
  suggestedQuestions?: string[]
  tokenCount?: number
  duration?: number
}

export type ContextPressureLevel = 'warn' | 'critical'

export type ChatStreamEvent =
  | { type: 'token'; content?: string }
  | {
      type: 'tool_status'
      name?: string
      label?: string
      status?: ToolStatusState
      estimate?: string
      elapsed?: number
      message?: string
      files?: string[]
    }
  | { type: 'tool_call'; content?: string }
  | { type: 'suggested_questions'; questions?: string[] }
  | { type: 'learn_note'; note?: import('./learn/types').LearnNote; drift?: string | null }
  | { type: 'learn_mind'; mind?: import('./learn/types').LearnMind }
  | { type: 'context_pressure'; level?: ContextPressureLevel }
  | { type: 'evidence_pack'; items?: import('./learn/types').EvidenceItem[] }
  | { type: 'file_write'; path?: string; content?: string; mode?: string }
  | { type: 'error'; content?: string }
  | { type: 'done' }
  | { type: 'heartbeat' }

export interface ChatSessionSummary {
  session_id: string
  mode?: 'learn' | 'search'
  title?: string
  updated_at?: string
  message_count?: number
  archived_note_path?: string
}

export interface ChatSessionDetail {
  session_id: string
  mode?: 'learn' | 'search'
  title?: string
  updated_at?: string
  messages: Array<{ role: string; content: string }>
  learn_mind?: import('./learn/types').LearnNote | import('./learn/types').LearnMind
  learn_note?: import('./learn/types').LearnNote
  evidence_pack?: import('./learn/types').EvidenceItem[]
  selected_files?: string[]
  archived_note_path?: string
  last_archived_at?: string
  last_archived_message_idx?: number
}
