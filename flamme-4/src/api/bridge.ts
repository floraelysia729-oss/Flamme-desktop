/**
 * 统一数据桥 — 对齐 docs/claude-code-design-patterns-analysis.md §4.1-C
 *
 * 组件只调本模块，不区分 HTTP 与 Tauri invoke：
 *   - Python FastAPI（fetch + X-Vault-Path）
 *   - Phase 1b：__FEATURE_TAURI__ 时文件 IO 走 invoke，AI/图谱仍走 HTTP
 */
import type {
  OverviewResponse,
  DomainLinksResponse,
  HeatmapEntry,
  PipelinePlan,
  IngestFileResponse,
  IngestStartResponse,
  IngestTaskStatusResponse,
  PipelineRunResponse,
  ResolveLinkResponse,
  StatusResponse,
  VaultSyncResponse,
} from './types'
import type { GraphResponse, GraphStats } from '../graph/types'
import type { VaultEntry } from './vault-types'
import type { ChatSessionDetail, ChatSessionSummary } from '../chat/types'
import { useConnectionStore } from './connection'
import { clampEntityBackfillLimit, DEFAULT_ENTITY_BACKFILL_LIMIT } from '../shared/ingest'
import {
  isTauriWebView,
  tauriInvoke,
  tauriInvokeVoid,
  tauriUnavailableMessage,
  waitForTauriReady,
} from './tauri-runtime'

declare const __FEATURE_TAURI__: boolean

export function getConnection() {
  const { baseUrl, vaultPath, llmApiKey, embedApiKey, brainApiKey, mineruApiToken } =
    useConnectionStore.getState()
  return {
    baseUrl,
    vaultPath,
    llmApiKey,
    embedApiKey,
    brainApiKey,
    mineruApiToken,
  }
}

/** 与 Obsidian 插件 buildAuthHeaders 对齐，供 fetch / SSE 共用 */
export function buildApiHeaders(extra?: HeadersInit): HeadersInit {
  const { vaultPath, llmApiKey, embedApiKey, brainApiKey, mineruApiToken } =
    useConnectionStore.getState()
  const h: Record<string, string> = { Accept: 'application/json' }
  const trim = (s: string) => s.trim()
  if (vaultPath.trim()) h['X-Vault-Path'] = trim(vaultPath)
  const llm = trim(llmApiKey)
  const embed = trim(embedApiKey)
  const brain = trim(brainApiKey) || llm
  const mineru = trim(mineruApiToken)
  if (llm) h['X-LLM-Key'] = llm
  if (embed) h['X-Embed-Key'] = embed
  if (brain) h['X-Brain-Key'] = brain
  if (mineru) h['X-MinerU-Token'] = mineru
  return { ...h, ...extra }
}

/** Python HTTP — 所有 /api/* 业务接口 */
export async function pythonFetch<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const { baseUrl } = getConnection()
  const { timeoutMs, ...fetchInit } = init ?? {}
  const url = `${baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`
  const res = await fetch(url, {
    ...fetchInit,
    signal: timeoutMs != null ? AbortSignal.timeout(timeoutMs) : fetchInit.signal,
    headers: { ...buildApiHeaders(), ...fetchInit.headers },
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText)
    throw new Error(`API ${res.status}: ${detail || res.statusText}`)
  }
  return res.json() as Promise<T>
}

export async function testPythonConnection(): Promise<boolean> {
  try {
    await pythonFetch<unknown>('/status')
    useConnectionStore.getState().setConnected(true)
    return true
  } catch {
    useConnectionStore.getState().setConnected(false)
    return false
  }
}

// ── Activity（仪表盘）────────────────────────────────────────

export function getActivityOverview() {
  return pythonFetch<OverviewResponse>('/activity/overview')
}

export function getActivityDomainLinks() {
  return pythonFetch<DomainLinksResponse>('/activity/domain-links')
}

export function getActivityHeatmap(days = 365) {
  return pythonFetch<HeatmapEntry[]>(`/activity/heatmap?days=${days}`)
}

// ── Graph（力导向可视化）──────────────────────────────────────

export function getFullGraph() {
  return pythonFetch<GraphResponse>('/graph/full')
}

export function getGraphStats() {
  return pythonFetch<GraphStats>('/graph/stats')
}

export function buildGraph() {
  return pythonFetch<GraphResponse & { error?: string; traceback?: string }>('/graph/build', {
    method: 'POST',
    timeoutMs: 120_000,
  })
}

// ── Status ───────────────────────────────────────────────────

export function getStatus() {
  return pythonFetch<StatusResponse>('/status')
}

export function hasVaultForDashboard(): boolean {
  const { connected, vaultPath } = useConnectionStore.getState()
  return connected && !!vaultPath.trim()
}

/** 解析 wikilink 目标 → vault 相对路径（与侧栏 resolveVaultLink 对齐，作权威回退） */
export function resolveLink(target: string) {
  const q = encodeURIComponent(target.trim())
  return pythonFetch<ResolveLinkResponse>(`/resolve-link?target=${q}`)
}

/** 同步 vault 索引（可选 embed / entities / graph / topics，供摄入收尾分步可视化） */
export function runVaultSync(options?: {
  embed?: boolean
  entities?: boolean
  entity_paths?: string[]
  graph?: boolean
  topics?: boolean
}) {
  return pythonFetch<VaultSyncResponse>('/ingest/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    timeoutMs: 600_000,
    body: JSON.stringify({
      embed: options?.embed ?? false,
      entities: options?.entities ?? false,
      entity_paths: options?.entity_paths,
      graph: options?.graph ?? false,
      topics: options?.topics ?? false,
    }),
  })
}

/** 扫描 vault 并写入 SQLite 索引（可选 embed / entities / graph / topics） */
export function runPipelineIndex(options?: {
  embed?: boolean
  entities?: boolean
  graph?: boolean
  topics?: boolean
}) {
  return pythonFetch<PipelineRunResponse>('/pipeline/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    timeoutMs: 600_000,
    body: JSON.stringify({
      preset: 'index',
      embed: options?.embed ?? false,
      entities: options?.entities ?? false,
      graph: options?.graph ?? false,
      topics: options?.topics ?? false,
      cleanup: true,
      scope: 'all',
    }),
  })
}

// ── Ingest / Pipeline ────────────────────────────────────────

/** 异步启动单文件摄入，返回 task_id 供轮询 */
export function ingestFileStart(path: string) {
  return pythonFetch<IngestStartResponse>('/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, wait: false }),
    timeoutMs: 60_000,
  })
}

/** 轮询摄入任务进度 */
export function getIngestTaskStatus(taskId: number) {
  return pythonFetch<IngestTaskStatusResponse>(`/ingest/tasks/${taskId}`, {
    timeoutMs: 30_000,
  })
}

export interface WaitIngestTaskOptions {
  signal?: AbortSignal
  pollMs?: number
  onProgress?: (status: IngestTaskStatusResponse) => void
}

/** 轮询直至摄入任务完成或失败 */
export async function waitIngestTask(
  taskId: number,
  options: WaitIngestTaskOptions = {},
): Promise<IngestTaskStatusResponse> {
  const { signal, pollMs = 2000, onProgress } = options
  for (;;) {
    if (signal?.aborted) {
      throw new Error('摄入已取消')
    }
    const status = await getIngestTaskStatus(taskId)
    onProgress?.(status)
    if (status.status === 'ok' || status.status === 'error') {
      return status
    }
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, pollMs)
      const onAbort = () => {
        clearTimeout(t)
        reject(new Error('摄入已取消'))
      }
      if (signal) {
        if (signal.aborted) {
          clearTimeout(t)
          reject(new Error('摄入已取消'))
          return
        }
        signal.addEventListener('abort', onAbort, { once: true })
      }
      setTimeout(() => {
        if (signal) signal.removeEventListener('abort', onAbort)
      }, pollMs + 50)
    })
  }
}

/** 同步等待单文件摄入完成（侧栏右键等场景） */
export function ingestFile(path: string) {
  return pythonFetch<IngestFileResponse>('/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, wait: true }),
    timeoutMs: 900_000,
  })
}

/** 扫描 vault vs DB，返回待处理清单 */
export function getPipelinePlan(scope: 'all' | 'git' = 'all') {
  return pythonFetch<PipelinePlan>(`/pipeline/plan?scope=${scope}`)
}

export interface RunPipelineIngestOptions {
  embed?: boolean
  entities?: boolean
  graph?: boolean
  topics?: boolean
  cleanup?: boolean
  scope?: 'all' | 'git'
}

/** 批量摄入二进制 + 同步 md 索引 */
export function runPipelineIngest(options: RunPipelineIngestOptions = {}) {
  const {
    embed = true,
    entities = false,
    graph = false,
    topics = false,
    cleanup = true,
    scope = 'all',
  } = options
  return pythonFetch<PipelineRunResponse>('/pipeline/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    timeoutMs: 600_000,
    body: JSON.stringify({
      preset: 'ingest',
      embed,
      entities,
      graph,
      topics,
      cleanup,
      scope,
    }),
  })
}

/** 对扫描出的缺实体源文件批量补跑抽取（单次篇数由 entity_limit 控制） */
export function runPipelineBackfillEntities(options?: {
  force?: boolean
  scope?: 'all' | 'git'
  limit?: number
}) {
  const entityLimit = clampEntityBackfillLimit(options?.limit ?? DEFAULT_ENTITY_BACKFILL_LIMIT)
  return pythonFetch<PipelineRunResponse>('/pipeline/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    timeoutMs: 600_000,
    body: JSON.stringify({
      preset: 'backfill-entities',
      embed: false,
      entities: true,
      force_entities: options?.force ?? false,
      entity_limit: entityLimit,
      cleanup: false,
      scope: options?.scope ?? 'all',
    }),
  })
}

/** 零 LLM：修剪失效 sources、删除孤儿实体、清理 entity_state */
export function runPipelineEntityMaintain(options?: { scope?: 'all' | 'git' }) {
  return pythonFetch<PipelineRunResponse>('/pipeline/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    timeoutMs: 120_000,
    body: JSON.stringify({
      preset: 'entity-maintain',
      embed: false,
      entities: false,
      cleanup: false,
      scope: options?.scope ?? 'all',
    }),
  })
}

// ── Documents（编辑器后续接入）────────────────────────────────

export interface DocumentListResponse {
  items: Array<{ path: string; title: string; level?: string }>
  total: number
  page: number
  per_page: number
}

export function listDocuments(params?: { page?: number; per_page?: number; search?: string }) {
  const q = new URLSearchParams()
  if (params?.page) q.set('page', String(params.page))
  if (params?.per_page) q.set('per_page', String(params.per_page))
  if (params?.search) q.set('search', params.search)
  const qs = q.toString()
  return pythonFetch<DocumentListResponse>(`/documents${qs ? `?${qs}` : ''}`)
}

export function getDocument(path: string) {
  return pythonFetch<unknown>(`/documents/${encodeURI(path)}`)
}

// ── Sidecar（Tauri Rust spawn Python）────────────────────────

export interface SidecarStatus {
  ready: boolean
  port: number
  detail: string
}

export async function getSidecarStatus(): Promise<SidecarStatus | null> {
  if (!isTauriWebView()) return null
  try {
    return await tauriInvoke<SidecarStatus>('sidecar_status')
  } catch (e) {
    console.warn('[tauri] sidecar_status:', e)
    return null
  }
}

/** Tauri 桌面端：等待 Rust 拉起的 Python API 就绪并更新 connected */
// ── Chat 会话（非 SSE）──────────────────────────────────────────

export interface ChatSessionsResponse {
  sessions: ChatSessionSummary[]
}

export function listChatSessions(mode?: 'learn' | 'search') {
  const q = mode ? `?mode=${mode}` : ''
  return pythonFetch<ChatSessionsResponse>(`/chat/sessions${q}`)
}

export function getChatSession(sessionId: string) {
  return pythonFetch<ChatSessionDetail>(`/chat/sessions/${encodeURIComponent(sessionId)}`)
}

export function patchChatSession(
  sessionId: string,
  patch: {
    archived_note_path?: string
    last_archived_at?: string
    last_archived_message_idx?: number
    title?: string
  },
) {
  return pythonFetch<{ ok: boolean; session_id: string }>(
    `/chat/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
  )
}

export function clearChatSession(sessionId: string) {
  return pythonFetch<{ ok: boolean }>(`/chat/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  })
}

export async function waitForPythonSidecar(maxMs = 30_000): Promise<boolean> {
  if (!isTauriWebView()) return false
  const deadline = Date.now() + maxMs
  try {
    while (Date.now() < deadline) {
      const st = await getSidecarStatus()
      if (st?.ready) return testPythonConnection()
      await new Promise((r) => setTimeout(r, 400))
    }
    return testPythonConnection()
  } catch (e) {
    console.warn('[tauri] waitForPythonSidecar:', e)
    return false
  }
}

// ── Vault FS（Tauri invoke）──────────────────────────────────

export type { VaultEntry }

export async function setVaultRoot(path: string): Promise<void> {
  if (!__FEATURE_TAURI__) return
  if (!(await waitForTauriReady())) {
    throw new Error(tauriUnavailableMessage('set_vault_root'))
  }
  await tauriInvokeVoid('set_vault_root', { path })
}

export async function listVaultTree(): Promise<VaultEntry> {
  if (!(await waitForTauriReady())) {
    throw new Error(tauriUnavailableMessage('list_vault_tree'))
  }
  return tauriInvoke<VaultEntry>('list_vault_tree')
}

export async function readVaultFile(path: string): Promise<string> {
  if (!__FEATURE_TAURI__) throw new Error('readVaultFile 仅 Tauri 桌面版可用')
  return tauriInvoke<string>('read_vault_file', { path })
}

export async function writeVaultFile(path: string, content: string): Promise<void> {
  if (!__FEATURE_TAURI__) throw new Error('writeVaultFile 仅 Tauri 桌面版可用')
  await tauriInvokeVoid('write_vault_file', { path, content })
}

export async function createVaultFile(
  parent: string,
  name: string,
  content?: string,
): Promise<string> {
  if (!__FEATURE_TAURI__) throw new Error('createVaultFile 仅 Tauri 桌面版可用')
  return tauriInvoke<string>('create_vault_file', {
    parent,
    name,
    content: content ?? null,
  })
}

export async function createVaultFolder(parent: string, name: string): Promise<string> {
  if (!__FEATURE_TAURI__) throw new Error('createVaultFolder 仅 Tauri 桌面版可用')
  return tauriInvoke<string>('create_vault_folder', { parent, name })
}

export async function deleteVaultEntry(path: string): Promise<void> {
  if (!__FEATURE_TAURI__) throw new Error('deleteVaultEntry 仅 Tauri 桌面版可用')
  await tauriInvokeVoid('delete_vault_entry', { path })
}

export async function renameVaultEntry(path: string, newName: string): Promise<string> {
  if (!__FEATURE_TAURI__) throw new Error('renameVaultEntry 仅 Tauri 桌面版可用')
  return tauriInvoke<string>('rename_vault_entry', { path, newName })
}

export async function pickVaultFolder(): Promise<string | null> {
  if (!isTauriWebView()) return null
  const { open } = await import('@tauri-apps/plugin-dialog')
  const selected = await open({ directory: true, multiple: false, title: '选择 Obsidian Vault' })
  if (!selected || Array.isArray(selected)) return null
  return selected
}

// ── 本地文件（浏览器 / Tauri 对话框）────────────────────────

export type LocalFsAdapter = {
  openFile: () => Promise<{ name: string; content: string } | null>
  saveFile: (name: string | null, content: string) => Promise<boolean>
}

let localFs: LocalFsAdapter | null = null

export function registerLocalFs(adapter: LocalFsAdapter) {
  localFs = adapter
}

export async function openLocalDocument(): Promise<{ name: string; content: string } | null> {
  if (__FEATURE_TAURI__) {
    if (!localFs) return null
    return localFs.openFile()
  }
  if (!localFs) return null
  return localFs.openFile()
}

export async function saveLocalDocument(
  name: string | null,
  content: string,
): Promise<boolean> {
  if (__FEATURE_TAURI__) {
    if (!localFs) return false
    return localFs.saveFile(name, content)
  }
  if (!localFs) return false
  return localFs.saveFile(name, content)
}
