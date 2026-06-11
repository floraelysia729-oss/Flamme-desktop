/**
 * SSE 流式对话 — 逻辑来自 flamme-backend/plugin/src/api/sse.ts
 * HTTP 入口统一走 bridge（X-Vault-Path 等）
 */
import { buildApiHeaders, getConnection } from '../api/bridge'
import type { LearnNote } from './learn/types'
import type { ChatMode, ChatStreamEvent } from './types'

function* drainSseBuffer(buffer: string): Generator<ChatStreamEvent, string> {
  const lines = buffer.split('\n')
  const rest = lines.pop() ?? ''

  for (const line of lines) {
    if (!line.startsWith('data: ')) continue
    try {
      yield JSON.parse(line.slice(6)) as ChatStreamEvent
    } catch {
      /* skip malformed */
    }
  }

  return rest
}

export async function* streamChat(
  message: string,
  sessionId: string,
  mode: ChatMode,
  signal?: AbortSignal,
  selectedFiles?: string[],
  learnNote?: LearnNote,
): AsyncGenerator<ChatStreamEvent> {
  const { baseUrl } = getConnection()
  const url = `${baseUrl.replace(/\/$/, '')}/chat`

  const body: Record<string, unknown> = {
    message,
    session_id: sessionId,
    mode,
  }
  if (mode === 'learn') {
    if (selectedFiles && selectedFiles.length > 0) {
      body.selected_files = selectedFiles
    }
    if (learnNote) {
      body.learn_note = learnNote
      body.learn_mind = learnNote
    }
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: buildApiHeaders({
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(body),
    signal,
  })

  if (!resp.ok || !resp.body) {
    const detail = await resp.text().catch(() => resp.statusText)
    throw new Error(`Chat stream failed (${resp.status}): ${detail || resp.statusText}`)
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const flush = function* (): Generator<ChatStreamEvent, void, unknown> {
    const drained = drainSseBuffer(buffer)
    let step = drained.next()
    while (!step.done) {
      yield step.value
      step = drained.next()
    }
    buffer = step.value
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      buffer += decoder.decode()
      yield* flush()
      break
    }
    buffer += decoder.decode(value, { stream: true })
    yield* flush()
  }
}
