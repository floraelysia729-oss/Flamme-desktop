import { useCallback, useEffect, useRef, useState } from 'react'
import { MessageCircle, PanelLeft, X, GraduationCap, BookOpen } from 'lucide-react'
import { useConnectionStore } from '../api/connection'
import { getChatSession, listChatSessions, truncateChatSession, writeVaultFile } from '../api/bridge'
import { isVaultMode } from '../files'
import { refreshWikiIndex } from '../shared/ingest'
import { useWorkspaceStore } from '../shared/workspaceStore'
import { useVaultStore } from '../vault/store'
import { streamChat } from './sse'
import { extractSuggestionQuestions } from './markdown'
import { useChatStore } from './store'
import type { ChatMessage, ToolStatus } from './types'
import ModeToggle from './ModeToggle'
import LearnFilePicker from './LearnFilePicker'
import MessageList from './MessageList'
import ChatInput from './ChatInput'
import NotePanel from './learn/NotePanel'
import NotePanelRailToggle from './learn/NotePanelRailToggle'
import { useNotePanelUiStore } from './learn/notePanelUiStore'
import ChatHistorySidebar from './learn/ChatHistorySidebar'
import EndClassDialog from './learn/EndClassDialog'
import { loadLearnNoteFromSession, useLearnStore } from './learn/store'
import { useMasteryQuizStore } from './learn/masteryQuizStore'
import { emptyLearnNote } from './learn/noteTemplate'
import { archiveLearnNote } from './learn/archiveLearnNote'
import { truncateLearnNoteForEdit } from './learn/truncateLearnNote'
import { useEditorQuoteStore } from '../shared/editorQuoteStore'

interface Props {
  onClose: () => void
}

export default function ChatPanel({ onClose }: Props) {
  const connected = useConnectionStore((s) => s.connected)
  const vaultPath = useConnectionStore((s) => s.vaultPath)
  const workspaceMode = useWorkspaceStore((s) => s.mode)
  const setWorkspaceMode = useWorkspaceStore((s) => s.setMode)

  const mode = useChatStore((s) => s.mode)
  const setMode = useChatStore((s) => s.setMode)
  const setDefaultMode = useChatStore((s) => s.setDefaultMode)
  const selectedFiles = useChatStore((s) => s.selectedFiles)
  const setLearnScope = useChatStore((s) => s.setLearnScope)
  const messages = useChatStore((s) => s.messages)
  const setMessages = useChatStore((s) => s.setMessages)
  const sessionId = useChatStore((s) => s.sessionId)
  const setSessionId = useChatStore((s) => s.setSessionId)
  const streaming = useChatStore((s) => s.streaming)
  const setStreaming = useChatStore((s) => s.setStreaming)
  const newSession = useChatStore((s) => s.newSession)
  const historyOpen = useChatStore((s) => s.historySidebarOpen)
  const setHistoryOpen = useChatStore((s) => s.setHistorySidebarOpen)

  const learnNote = useLearnStore((s) => s.learnNote)
  const setLearnNote = useLearnStore((s) => s.setLearnNote)
  const mergeLearnNoteFromAi = useLearnStore((s) => s.mergeLearnNoteFromAi)
  const driftToast = useLearnStore((s) => s.driftToast)
  const evidencePack = useLearnStore((s) => s.evidencePack)
  const notePanelOpen = useNotePanelUiStore((s) => s.open)
  const setEvidencePack = useLearnStore((s) => s.setEvidencePack)
  const archivedNotePath = useLearnStore((s) => s.archivedNotePath)
  const lastArchivedAt = useLearnStore((s) => s.lastArchivedAt)
  const lastArchivedMessageIdx = useLearnStore((s) => s.lastArchivedMessageIdx)
  const setArchiveMeta = useLearnStore((s) => s.setArchiveMeta)
  const contextPressure = useLearnStore((s) => s.contextPressure)
  const setContextPressure = useLearnStore((s) => s.setContextPressure)
  const resetLearn = useLearnStore((s) => s.resetLearn)
  const wrongLog = useMasteryQuizStore((s) => s.wrongLog)

  const [historyRefresh, setHistoryRefresh] = useState(0)
  const [endClassOpen, setEndClassOpen] = useState(false)
  const [archiveBusy, setArchiveBusy] = useState(false)
  const [archiveToast, setArchiveToast] = useState<string | null>(null)
  const [noteConflict, setNoteConflict] = useState(false)

  const abortRef = useRef<AbortController | null>(null)

  const loadSession = useCallback(
    async (sid: string) => {
      try {
        const data = await getChatSession(sid)
        const loaded: ChatMessage[] = []
        for (const m of data.messages ?? []) {
          if (m.role === 'user' || m.role === 'assistant') {
            loaded.push({ role: m.role, content: m.content })
          }
        }
        setSessionId(sid)
        const sessionMode = data.mode === 'learn' || data.mode === 'search' ? data.mode : mode
        if (sessionMode === 'learn') {
          useChatStore.setState({ lastLearnSessionId: sid })
        } else {
          useChatStore.setState({ lastSearchSessionId: sid })
        }
        setMessages(loaded)
        if (data.mode === 'learn' || mode === 'learn') {
          const raw = data.learn_note ?? data.learn_mind
          const note = raw ? loadLearnNoteFromSession(raw) : null
          if (note) setLearnNote(note)
          else resetLearn()
          useLearnStore.getState().rebuildQaMessageLinksFromMessages(loaded, note ?? undefined)
          if (data.evidence_pack) setEvidencePack(data.evidence_pack)
          if (data.selected_files?.length) {
            useChatStore.setState({ selectedFiles: data.selected_files })
          }
          setArchiveMeta(
            data.archived_note_path ?? null,
            data.last_archived_at ?? null,
            data.last_archived_message_idx ?? 0,
          )
        }
      } catch {
        /* ignore */
      }
    },
    [
      mode,
      setSessionId,
      setMessages,
      setLearnNote,
      resetLearn,
      setEvidencePack,
      setArchiveMeta,
    ],
  )

  useEffect(() => {
    if (!connected) return
    void (async () => {
      try {
        const { sessions } = await listChatSessions(mode)
        const recentId = sessions?.[0]?.session_id ?? null
        if (!recentId) return
        await loadSession(recentId)
      } catch {
        /* 首次无会话 */
      }
    })()
  }, [connected, mode, loadSession])

  const patchAssistant = useCallback(
    (idx: number, patch: Partial<ChatMessage>) => {
      const cur = useChatStore.getState().messages
      const next = [...cur]
      next[idx] = { ...next[idx], ...patch }
      setMessages(next)
    },
    [setMessages],
  )

  const applyToolStatus = useCallback(
    (idx: number, event: ToolStatus & { type?: string }) => {
      const cur = useChatStore.getState().messages
      const msg = cur[idx]
      const list = [...(msg.toolStatus ?? [])]
      const activeIdx = list.findLastIndex(
        (ts) => ts.name === event.name && ts.status !== 'done',
      )

      if (event.status === 'done') {
        if (activeIdx >= 0) {
          list[activeIdx] = {
            ...list[activeIdx],
            status: 'done',
            elapsed: event.elapsed,
          }
        }
      } else if (event.status === 'progress') {
        if (activeIdx >= 0) {
          list[activeIdx] = {
            ...list[activeIdx],
            status: 'progress',
            message: event.message,
          }
        } else {
          list.push({
            name: event.name ?? 'tool',
            label: event.label,
            status: 'progress',
            message: event.message,
          })
        }
      } else if (event.name) {
        list.push({
          name: event.name,
          label: event.label,
          status: event.status ?? 'running',
          estimate: event.estimate,
        })
      }

      patchAssistant(idx, { toolStatus: list })
    },
    [patchAssistant],
  )

  const cancelStream = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const executeChatTurn = useCallback(
    async (text: string, userMsgIdx: number) => {
      cancelStream()
      const controller = new AbortController()
      abortRef.current = controller
      setStreaming(true)
      const hadNoteConflict = noteConflict
      setNoteConflict(false)
      const chatMode = useChatStore.getState().mode
      if (chatMode === 'learn' && !hadNoteConflict) {
        useLearnStore.setState({ userEdited: false })
      }

      const sid = useChatStore.getState().sessionId
      const files =
        chatMode === 'learn' ? useChatStore.getState().selectedFiles : undefined
      const note =
        chatMode === 'learn' ? useLearnStore.getState().learnNote : undefined

      const startTime = Date.now()
      let fullContent = ''
      let tokens = 0
      let contentFlushTimer: ReturnType<typeof setTimeout> | null = null

      const flushContentPatch = () => {
        if (contentFlushTimer !== null) {
          clearTimeout(contentFlushTimer)
          contentFlushTimer = null
        }
        patchAssistant(userMsgIdx + 1, {
          content: fullContent,
          tokenCount: tokens,
          duration: Math.round((Date.now() - startTime) / 100) / 10,
        })
      }

      const scheduleContentPatch = () => {
        if (contentFlushTimer !== null) return
        contentFlushTimer = setTimeout(() => {
          contentFlushTimer = null
          flushContentPatch()
        }, 70)
      }

      try {
        for await (const event of streamChat(
          text,
          sid,
          chatMode,
          controller.signal,
          files,
          note,
        )) {
          if (abortRef.current !== controller) return
          if (event.type === 'heartbeat') continue

          if (event.type === 'token' && event.content) {
            fullContent += event.content
            tokens++
            scheduleContentPatch()
          } else if (event.type === 'tool_status') {
            applyToolStatus(userMsgIdx + 1, event as ToolStatus & { type?: string })
            if (
              event.status === 'done' &&
              event.name === 'wiki_create_page' &&
              connected
            ) {
              void refreshWikiIndex().catch(() => {})
              if (isVaultMode()) {
                void useVaultStore.getState().refreshTree()
              }
            }
          } else if (event.type === 'file_write' && event.path && event.content != null) {
            if (isVaultMode()) {
              void writeVaultFile(event.path, event.content)
                .then(() => refreshWikiIndex())
                .then(() => useVaultStore.getState().refreshTree())
                .catch(() => {})
            }
          } else if (event.type === 'tool_call' && event.content) {
            const prev = useChatStore.getState().messages[userMsgIdx + 1]
            patchAssistant(userMsgIdx + 1, {
              toolCalls: [...(prev.toolCalls ?? []), event.content],
            })
          } else if (event.type === 'suggested_questions' && event.questions) {
            patchAssistant(userMsgIdx + 1, { suggestedQuestions: event.questions })
          } else if (event.type === 'learn_note' && event.note) {
            const mergedNote = loadLearnNoteFromSession(event.note)
            const result = mergeLearnNoteFromAi(mergedNote, event.drift)
            if (result === 'applied') {
              useLearnStore.getState().setQaMessageLink(mergedNote.qaRound, userMsgIdx)
            }
            if (result === 'skipped') setNoteConflict(true)
          } else if (event.type === 'learn_mind' && event.mind) {
            const result = mergeLearnNoteFromAi(
              loadLearnNoteFromSession(event.mind),
            )
            if (result === 'skipped') setNoteConflict(true)
          } else if (event.type === 'evidence_pack' && event.items) {
            setEvidencePack(event.items)
          } else if (event.type === 'context_pressure' && event.level) {
            setContextPressure(event.level)
          } else if (event.type === 'error' && event.content) {
            flushContentPatch()
            patchAssistant(userMsgIdx + 1, {
              content: `${fullContent}\n\n**错误:** ${event.content}`.trim(),
            })
            break
          } else if (event.type === 'done') {
            break
          }
        }

        flushContentPatch()
        const { questions, cleanText } = extractSuggestionQuestions(fullContent)
        if (questions.length > 0) {
          patchAssistant(userMsgIdx + 1, {
            content: cleanText,
            suggestedQuestions: questions,
          })
        }
        setHistoryRefresh((k) => k + 1)
      } catch (e) {
        if (abortRef.current !== controller) return
        flushContentPatch()
        const err = e as Error
        if (err.name === 'AbortError') {
          patchAssistant(userMsgIdx + 1, {
            content: `${fullContent}\n\n[已取消]`.trim(),
          })
        } else {
          patchAssistant(userMsgIdx + 1, { content: `**错误:** ${err.message}` })
        }
      } finally {
        setStreaming(false)
        abortRef.current = null
      }
    },
    [
      connected,
      cancelStream,
      setStreaming,
      patchAssistant,
      applyToolStatus,
      mergeLearnNoteFromAi,
      setEvidencePack,
      setContextPressure,
      noteConflict,
    ],
  )

  const handleSend = useCallback(
    async (text: string) => {
      if (!text.trim() || streaming) return
      if (!connected) return

      const cur = useChatStore.getState().messages
      const idx = cur.length
      setMessages([
        ...cur,
        { role: 'user', content: text },
        { role: 'assistant', content: '' },
      ])
      await executeChatTurn(text, idx)
    },
    [streaming, connected, setMessages, executeChatTurn],
  )

  const handleEditUserMessage = useCallback(
    async (userMsgIdx: number, text: string) => {
      const trimmed = text.trim()
      if (!trimmed || streaming || !connected) return

      const cur = useChatStore.getState().messages
      if (cur[userMsgIdx]?.role !== 'user') return

      const sid = useChatStore.getState().sessionId
      const chatMode = useChatStore.getState().mode
      let rolledNote: ReturnType<typeof truncateLearnNoteForEdit> | undefined

      try {
        if (chatMode === 'learn') {
          rolledNote = truncateLearnNoteForEdit(
            useLearnStore.getState().learnNote,
            cur,
            userMsgIdx,
          )
        }
        await truncateChatSession(sid, userMsgIdx, rolledNote)
      } catch (e) {
        patchAssistant(userMsgIdx + 1, {
          content: `**错误:** ${(e as Error).message}`,
        })
        return
      }

      if (chatMode === 'learn' && rolledNote) {
        setLearnNote(rolledNote, false)
        useLearnStore.setState({ userEdited: false })
        useLearnStore
          .getState()
          .rebuildQaMessageLinksFromMessages(cur.slice(0, userMsgIdx), rolledNote)
      }

      setMessages([
        ...cur.slice(0, userMsgIdx),
        { role: 'user', content: trimmed },
        { role: 'assistant', content: '' },
      ])
      await executeChatTurn(trimmed, userMsgIdx)
    },
    [
      streaming,
      connected,
      setMessages,
      setLearnNote,
      patchAssistant,
      executeChatTurn,
    ],
  )

  const handleModeChange = (next: typeof mode) => {
    setMode(next)
    setDefaultMode(next)
    if (next === 'learn') {
      resetLearn()
      useChatStore.getState().setHistorySidebarOpen(false)
      useWorkspaceStore.getState().setMode('chat')
    }
  }

  const handleNewSession = () => {
    useEditorQuoteStore.getState().clearQuote('new-session')
    cancelStream()
    newSession()
    if (mode === 'learn') resetLearn()
    setHistoryRefresh((k) => k + 1)
  }

  const handleSelectSession = (id: string) => {
    if (streaming) return
    useEditorQuoteStore.getState().clearQuote('session-change')
    cancelStream()
    void loadSession(id)
  }

  const handleEndClass = async (andNewSession: boolean) => {
    setArchiveBusy(true)
    try {
      const result = await archiveLearnNote({
        note: learnNote,
        sessionId: useChatStore.getState().sessionId,
        selectedFiles: useChatStore.getState().selectedFiles,
        archivedNotePath,
        wrongLog,
      })
      setArchiveMeta(result.path, new Date().toISOString(), 0)
      setArchiveToast(
        result.isUpdate ? `已更新笔记：${result.path}` : `已保存至：${result.path}`,
      )
      if (isVaultMode()) {
        const { useVaultStore } = await import('../vault/store')
        void useVaultStore.getState().refreshTree()
      }
      setEndClassOpen(false)
      if (andNewSession) handleNewSession()
    } catch (e) {
      setArchiveToast(`存档失败：${(e as Error).message}`)
    } finally {
      setArchiveBusy(false)
      setTimeout(() => setArchiveToast(null), 5000)
    }
  }

  const handleNoteChange = (note: typeof learnNote, fromUser?: boolean) => {
    setLearnNote(note, fromUser)
  }

  return (
    <div className="chat-panel h-full flex flex-col min-h-0 text-[var(--ink-on-glass,var(--ink))]">
      <header className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-[var(--border)]/50">
        <button
          type="button"
          className={`tool-btn p-1.5 rounded-lg ${historyOpen ? 'bg-[var(--accent)]/15' : ''}`}
          onClick={() => setHistoryOpen(!historyOpen)}
          title="历史会话"
        >
          <PanelLeft size={16} />
        </button>
        <MessageCircle size={16} className="shrink-0 opacity-80" />
        <span className="text-sm font-medium flex-1 truncate">AI 对话</span>
        {workspaceMode === 'chat' && (
          <button
            type="button"
            className="text-[11px] px-2 py-1 rounded-md border border-[var(--border)]/60 hover:border-[var(--accent)]/40 flex items-center gap-1"
            onClick={() => setWorkspaceMode('read')}
            title="返回阅读模式"
          >
            <BookOpen size={14} />
            返回阅读
          </button>
        )}
        <ModeToggle mode={mode} onChange={handleModeChange} disabled={streaming} />
        {mode === 'learn' && (
          <button
            type="button"
            className="text-[11px] px-2 py-1 rounded-md border border-[var(--border)]/60 hover:border-[var(--accent)]/40 flex items-center gap-1"
            onClick={() => setEndClassOpen(true)}
            disabled={streaming || messages.length === 0}
            title="下课存档"
          >
            <GraduationCap size={14} />
            下课
          </button>
        )}
        <button
          type="button"
          className="text-[11px] px-2 py-1 rounded-md border border-[var(--border)]/60 hover:border-[var(--accent)]/40"
          onClick={handleNewSession}
          disabled={streaming}
        >
          新对话
        </button>
        <button type="button" className="tool-btn p-1.5 rounded-lg" onClick={onClose} title="关闭">
          <X size={16} />
        </button>
      </header>

      {!connected && (
        <p className="text-xs px-3 py-2 text-[var(--danger)] bg-[var(--danger)]/10">
          后端未连接。请在设置 → 后端 中测试连接；Tauri 下 sidecar 会自动启动。
        </p>
      )}
      {mode === 'learn' && !vaultPath.trim() && (
        <p className="text-xs px-3 py-1 text-[var(--ink-muted-on-glass,var(--ink-muted))]">
          未设置 Vault 路径时，学习范围仅依赖后端默认配置。
        </p>
      )}
      {noteConflict && mode === 'learn' && (
        <p className="text-xs px-3 py-1 bg-amber-500/10 text-amber-200 flex gap-2 items-center">
          AI 更新了学习笔记，但你已手动编辑。
          <button
            type="button"
            className="underline"
            onClick={() => {
              useLearnStore.setState({ userEdited: false })
              setNoteConflict(false)
            }}
          >
            保留我的版本
          </button>
        </p>
      )}
      {archiveToast && (
        <p className="text-xs px-3 py-1 bg-[var(--accent)]/10 text-[var(--ink)]">{archiveToast}</p>
      )}

      {mode === 'learn' && (
        <LearnFilePicker selected={selectedFiles} onChange={setLearnScope} />
      )}

      <div className="flex flex-1 min-h-0 min-w-0">
        <ChatHistorySidebar
          open={historyOpen}
          mode={mode}
          currentSessionId={sessionId}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          refreshKey={historyRefresh}
        />

        {mode === 'learn' ? (
          <div className="learn-note-with-panel relative flex flex-1 min-h-0 min-w-0">
            <div className="flex flex-1 min-h-0 min-w-0 flex-col">
              <MessageList
                messages={messages}
                streaming={streaming}
                onPickSuggestion={(q) => void handleSend(q)}
                onEditUserMessage={(idx, text) => void handleEditUserMessage(idx, text)}
              />
              <ChatInput
                streaming={streaming}
                onSend={(t) => void handleSend(t)}
                onCancel={cancelStream}
              />
            </div>
            {notePanelOpen && (
              <NotePanel
                note={learnNote}
                sessionId={sessionId}
                evidencePack={evidencePack}
                onNoteChange={handleNoteChange}
                contextPressure={contextPressure}
                driftToast={driftToast}
              />
            )}
            <NotePanelRailToggle />
          </div>
        ) : (
          <div className="flex flex-1 min-h-0 min-w-0 flex-col">
            <MessageList
              messages={messages}
              streaming={streaming}
              onPickSuggestion={(q) => void handleSend(q)}
              onEditUserMessage={(idx, text) => void handleEditUserMessage(idx, text)}
            />
            <ChatInput
              streaming={streaming}
              onSend={(t) => void handleSend(t)}
              onCancel={cancelStream}
            />
          </div>
        )}
      </div>

      <EndClassDialog
        open={endClassOpen}
        note={learnNote}
        wrongLog={wrongLog}
        archivedNotePath={archivedNotePath}
        lastArchivedAt={lastArchivedAt}
        onConfirm={handleEndClass}
        onClose={() => setEndClassOpen(false)}
        busy={archiveBusy}
        tauriOnly={!isVaultMode()}
      />
    </div>
  )
}
