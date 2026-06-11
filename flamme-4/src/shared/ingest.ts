import {
  getPipelinePlan,
  hasVaultForDashboard,
  ingestFileStart,
  runPipelineEntityMaintain,
  runVaultSync,
  testPythonConnection,
  waitIngestTask,
} from '../api/bridge'
import type { IngestTaskStatusResponse } from '../api/types'
import type {
  IngestStage,
  IngestStructuredResult,
  PipelinePlan,
  PipelineScan,
  VaultSyncResponse,
} from '../api/types'
import { isVaultMode } from '../files'
import { useVaultStore } from '../vault/store'

const INGESTABLE_RE = /\.(md|pdf|docx?|pptx?)$/i
const WIKI_DIR_NAMES = new Set(['entities', 'topics', 'comparisons', 'explorations'])

/** 系统 wiki 页（entity/topic 等）不可摄入，含 test/entities/ 等嵌套路径 */
export function isWikiSystemPath(path: string): boolean {
  const norm = path.replace(/\\/g, '/')
  return norm.split('/').some((part) => WIKI_DIR_NAMES.has(part))
}

export function isIngestableFile(name: string): boolean {
  if (/\.excalidraw\.md$/i.test(name)) return true
  return INGESTABLE_RE.test(name)
}

/** 完整 vault 相对路径是否可摄入 */
export function isIngestablePath(path: string): boolean {
  if (isWikiSystemPath(path)) return false
  const name = path.replace(/\\/g, '/').split('/').pop() ?? path
  return isIngestableFile(name)
}

export function canIngest(): boolean {
  return isVaultMode() && hasVaultForDashboard()
}

function formatEstimate(seconds: number): string {
  if (seconds < 60) return `约 ${seconds} 秒`
  return `约 ${Math.ceil(seconds / 60)} 分钟`
}

export const DEFAULT_ENTITY_BACKFILL_LIMIT = 20
export const MIN_ENTITY_BACKFILL_LIMIT = 1
export const MAX_ENTITY_BACKFILL_LIMIT = 100

export function clampEntityBackfillLimit(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_ENTITY_BACKFILL_LIMIT
  return Math.max(
    MIN_ENTITY_BACKFILL_LIMIT,
    Math.min(MAX_ENTITY_BACKFILL_LIMIT, Math.round(value)),
  )
}

export function formatPlanSummary(plan: PipelinePlan): string {
  const { scan } = plan
  const parts: string[] = []
  const bin = scan.binary_unprocessed?.length ?? 0
  const mdNew = scan.md_new?.length ?? 0
  const mdUpd = scan.md_updated?.length ?? 0
  const mdRm = scan.md_removed?.length ?? 0
  const embed = scan.missing_embed?.length ?? 0
  const entityExtract = scan.missing_entity_extract_count ?? plan.entity_pending_count ?? 0
  const staleSources = scan.entity_stale_sources_count ?? 0
  const orphans = scan.orphan_entities_count ?? 0

  if (bin > 0) parts.push(`${bin} 个二进制待摄入`)
  if (mdNew > 0) parts.push(`${mdNew} 个 md 新增`)
  if (mdUpd > 0) parts.push(`${mdUpd} 个 md 更新`)
  if (mdRm > 0) parts.push(`${mdRm} 个已删记录待清理`)
  if (embed > 0) parts.push(`${embed} 个待嵌入向量`)
  if (entityExtract > 0) parts.push(`${entityExtract} 篇待抽实体`)
  if (staleSources > 0) parts.push(`${staleSources} 个实体源已失效`)
  if (orphans > 0) parts.push(`${orphans} 个孤儿实体待清理`)

  if (parts.length === 0) {
    return '源文件已全部同步；可重建图谱与主题，或检查实体健康'
  }
  return `${parts.join('，')}（${formatEstimate(plan.estimate_seconds ?? 0)}）`
}

export function formatIngestError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  const pauseHint = '摄入已暂停，请检查后端连接后点击「继续摄入」'
  if (/mineru/i.test(msg)) {
    return `${msg}。请在设置 → API 中填写 MinerU Token`
  }
  if (msg.includes(pauseHint)) {
    return msg
  }
  if (/^API 5\d\d:/.test(msg)) {
    return `${msg}。请完全退出并重启 Flamme 应用（后端需重新加载）`
  }
  if (/network|fetch|failed to fetch|aborted|无法连接|ECONNREFUSED/i.test(msg)) {
    return `${msg}。${pauseHint}`
  }
  return msg
}

export function collectPendingPaths(plan: PipelinePlan, limit = 5): string[] {
  const { scan } = plan
  return [
    ...(scan.binary_unprocessed ?? []),
    ...(scan.md_new ?? []),
    ...(scan.md_updated ?? []),
  ].slice(0, limit)
}

export function formatRunSummary(
  steps: Array<{
    step: string
    summary?: string
    ok?: number
    failed?: number
    total?: number
    deleted?: number
    result?: unknown
  }>,
): string {
  const parts: string[] = []
  for (const s of steps) {
    if (s.step === 'ingest' && s.total != null) {
      parts.push(`摄入 ${s.ok ?? 0}/${s.total}${s.failed ? `，失败 ${s.failed}` : ''}`)
    } else if (s.step === 'sync' && s.summary) {
      parts.push(s.summary.replace(/\n/g, '；'))
    } else if (s.step === 'cleanup' && s.deleted != null) {
      parts.push(`清理 ${s.deleted} 条`)
    } else if (s.step === 'graph' && s.result) {
      const r = s.result as { status?: string; nodes?: number }
      if (typeof r === 'object' && r?.status === 'skipped') {
        parts.push('图谱: 无变更')
      } else if (typeof r === 'object' && r?.status === 'rebuilt') {
        parts.push(`图谱: 已重建${r.nodes != null ? ` (${r.nodes} 节点)` : ''}`)
      } else {
        parts.push(`图谱: ${String(s.result)}`)
      }
    } else if (s.step === 'entities' && s.result) {
      const r = s.result as { built?: number; unchanged?: number; error?: string }
      if (typeof r === 'object' && r?.error) {
        parts.push(`实体错误: ${r.error}`)
      } else if (typeof r === 'object' && r?.built === 0 && (r?.unchanged ?? 0) > 0) {
        parts.push(`实体: 无变更（跳过 ${r.unchanged} 篇）`)
      } else if (typeof r === 'object' && r?.built != null) {
        const tail = r.unchanged ? `，跳过 ${r.unchanged}` : ''
        parts.push(`实体: 更新 ${r.built} 篇${tail}`)
      } else {
        parts.push(`实体: ${String(s.result)}`)
      }
    } else if (s.step === 'topics' && s.result) {
      const r = s.result as { built?: number; unchanged?: number; error?: string }
      if (typeof r === 'object' && r?.error) {
        parts.push(`主题错误: ${r.error}`)
      } else if (typeof r === 'object' && r?.built === 0 && (r?.unchanged ?? 0) > 0) {
        parts.push(`主题: 无变更（跳过 ${r.unchanged} 个社区）`)
      } else if (typeof r === 'object' && r?.built != null) {
        const tail = r.unchanged ? `，跳过 ${r.unchanged}` : ''
        parts.push(`主题: 更新 ${r.built} 篇${tail}`)
      } else {
        parts.push(`主题: ${String(s.result)}`)
      }
    }
  }
  return parts.length > 0 ? parts.join('；') : '摄入完成'
}

/** 批量收尾阶段 — 同步 / 嵌入 / 实体 / 图谱 / 主题 */
export function anticipatedIndexStages(): IngestStage[] {
  return [
    { id: 'index_sync', label: '同步文档索引', status: 'pending' },
    { id: 'embed', label: '向量嵌入', status: 'pending' },
    { id: 'entities', label: '实体抽取', status: 'pending' },
    { id: 'graph', label: '知识图谱 (Leiden)', status: 'pending' },
    { id: 'topics', label: '主题 Hub 页', status: 'pending' },
  ]
}

function cloneStages(stages: IngestStage[]): IngestStage[] {
  return stages.map((s) => ({ ...s }))
}

function setStage(
  stages: IngestStage[],
  id: string,
  status: IngestStage['status'],
  detail?: string,
): IngestStage[] {
  return stages.map((s) =>
    s.id === id ? { ...s, status, detail: detail ?? s.detail } : s,
  )
}

function setStageRunning(stages: IngestStage[], id: string): IngestStage[] {
  return stages.map((s) =>
    s.id === id ? { ...s, status: 'running' as const } : s,
  )
}

function syncDetail(data: VaultSyncResponse): string {
  const a = data.added?.length ?? 0
  const u = data.updated?.length ?? 0
  const r = data.removed?.length ?? 0
  if (a + u + r === 0) return '无变更'
  const parts: string[] = []
  if (a) parts.push(`+${a}`)
  if (u) parts.push(`~${u}`)
  if (r) parts.push(`-${r}`)
  return parts.join(' ')
}

function graphDetail(result: unknown): { status: IngestStage['status']; detail: string } {
  if (typeof result === 'object' && result && 'status' in result) {
    const r = result as { status?: string; nodes?: number }
    if (r.status === 'skipped') return { status: 'skipped', detail: '无变更' }
    if (r.status === 'rebuilt') {
      return { status: 'ok', detail: r.nodes != null ? `${r.nodes} 节点` : '已重建' }
    }
  }
  if (result === 'rebuilt') return { status: 'ok', detail: '已重建' }
  if (typeof result === 'string' && result) return { status: 'failed', detail: result }
  return { status: 'skipped', detail: '未执行' }
}

function topicsDetail(data: VaultSyncResponse): { status: IngestStage['status']; detail: string } {
  if (data.topics_error) return { status: 'failed', detail: data.topics_error }
  const tr = data.topics_result
  if (!tr) return { status: 'skipped', detail: '未执行' }
  const built = tr.built ?? 0
  const unchanged = tr.unchanged ?? 0
  if (built === 0 && unchanged > 0) return { status: 'skipped', detail: `跳过 ${unchanged} 社区` }
  if (built > 0) {
    return {
      status: 'ok',
      detail: unchanged > 0 ? `更新 ${built} 篇，跳过 ${unchanged}` : `更新 ${built} 篇`,
    }
  }
  return { status: 'ok', detail: '完成' }
}

function entitiesDetail(data: VaultSyncResponse): { status: IngestStage['status']; detail: string } {
  if (data.entities_error) return { status: 'failed', detail: data.entities_error }
  const er = data.entities_result
  if (!er) return { status: 'skipped', detail: '未执行' }
  const built = er.built ?? 0
  const unchanged = er.unchanged ?? 0
  if (built === 0 && unchanged > 0) return { status: 'skipped', detail: `跳过 ${unchanged} 篇` }
  if (built > 0) {
    return {
      status: 'ok',
      detail: unchanged > 0 ? `更新 ${built} 篇，跳过 ${unchanged}` : `更新 ${built} 篇`,
    }
  }
  return { status: 'ok', detail: '完成' }
}

function dirtySourceMdPaths(data: VaultSyncResponse): string[] {
  const paths = [...(data.added ?? []), ...(data.updated ?? [])]
  return paths.filter((p) => /\.md$/i.test(p) && isIngestablePath(p) && !isWikiSystemPath(p))
}

function summaryFromStages(stages: IngestStage[]): string {
  const parts: string[] = []
  for (const s of stages) {
    if (s.status === 'failed' && s.detail) parts.push(`${s.label}: ${s.detail}`)
    else if (s.status === 'ok' && s.detail && s.detail !== '无变更' && s.detail !== '未执行') {
      parts.push(`${s.label} ${s.detail}`)
    } else if (s.status === 'skipped' && s.id !== 'embed') {
      parts.push(`${s.label}: 无变更`)
    }
  }
  return parts.length > 0 ? parts.join('；') : '索引已是最新'
}

async function assertSyncOk(res: VaultSyncResponse, step: string): Promise<VaultSyncResponse> {
  if (res.status === 'error' || res.error) {
    throw new IngestInterruptedError(res.error ?? `${step} 失败`)
  }
  return res
}

export interface IndexPipelineResult {
  summary: string
  stages: IngestStage[]
}

export interface IngestFileLog {
  path: string
  status: 'ok' | 'failed' | 'skipped' | 'running'
  message?: string
  stages?: IngestStage[]
}

function pptPdfRel(pptPath: string): string {
  return pptPath.replace(/\.pptx?$/i, '.pdf')
}

/** 队列中已有同 stem 的 PDF 时不再排队 PPT，避免重复 PPT→PDF */
export function dedupePptWhenPdfQueued(paths: string[]): string[] {
  const pending = new Set(paths.map((p) => p.replace(/\\/g, '/')))
  return paths.filter((p) => {
    const norm = p.replace(/\\/g, '/')
    if (!/\.pptx?$/i.test(norm)) return true
    return !pending.has(pptPdfRel(norm))
  })
}

/** 从 plan 构建去重队列（二进制优先；排除 entity/topic 系统页） */
export function buildIngestQueue(plan: PipelinePlan): string[] {
  const scan = plan.scan
  const seen = new Set<string>()
  const queue: string[] = []
  const add = (paths: string[] | undefined) => {
    for (const p of paths ?? []) {
      if (seen.has(p) || !isIngestablePath(p)) continue
      seen.add(p)
      queue.push(p)
    }
  }
  add(scan.binary_unprocessed)
  add(scan.md_new)
  add(scan.md_updated)
  add(scan.missing_embed)
  return dedupePptWhenPdfQueued(queue)
}

/** 后端 plan 判定：该路径是否仍需处理（去重） */
export function isPathStillPending(path: string, scan: PipelineScan): boolean {
  const lists = [
    scan.binary_unprocessed,
    scan.md_new,
    scan.md_updated,
    scan.missing_embed,
  ]
  return lists.some((list) => list?.includes(path))
}

/** 等待单文件摄入时展示的预估管道阶段 */
export function anticipatedStages(path: string): IngestStage[] {
  const pending = (id: string, label: string): IngestStage => ({
    id,
    label,
    status: 'pending',
  })
  if (/\.pptx?$/i.test(path)) {
    return [
      { id: 'ppt_to_pdf', label: 'PPTX → PDF', status: 'running' },
      pending('pdf_parse', 'PDF 解析 (MinerU)'),
      pending('save_converted', '保存 converted.md'),
      pending('index', '写入文档索引'),
      pending('embed', '向量嵌入'),
      pending('entities', '实体 / 主题页'),
    ]
  }
  if (/\.pdf$/i.test(path) || /\.docx?$/i.test(path)) {
    return [
      { id: 'pdf_parse', label: 'PDF 解析 (MinerU)', status: 'running' },
      pending('save_converted', '保存 converted.md'),
      pending('index', '写入文档索引'),
      pending('embed', '向量嵌入'),
      pending('entities', '实体 / 主题页'),
    ]
  }
  if (/\.excalidraw\.md$/i.test(path)) {
    return [{ id: 'ocr', label: 'Excalidraw OCR', status: 'running' }]
  }
  return [
    { id: 'parse_md', label: '解析 Markdown', status: 'running' },
    pending('index', '写入文档索引'),
    pending('embed', '向量嵌入'),
    pending('entities', '实体 / 主题页'),
  ]
}

export function parseIngestResult(raw: unknown): IngestStructuredResult {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as IngestStructuredResult
      if (parsed && typeof parsed === 'object') return parsed
    } catch {
      return { message: raw, stages: [] }
    }
    return { message: raw, stages: [] }
  }
  if (raw && typeof raw === 'object') {
    const o = raw as IngestStructuredResult
    return {
      message: o.message,
      stages: o.stages ?? [],
      error: o.error,
    }
  }
  return { message: String(raw ?? ''), stages: [] }
}

export const INGEST_CONCURRENCY = 3
const POLL_MS = 2000
const HEARTBEAT_MS = 20_000

function isPptPath(path: string): boolean {
  return /\.pptx?$/i.test(path)
}

function buildPhaseMessage(completed: number, total: number, activeCount: number): string {
  if (total <= 0) return '准备同步'
  const parallel = Math.min(INGEST_CONCURRENCY, total)
  if (activeCount > 0) {
    return `并行 ${parallel} 路 · 已完成 ${completed}/${total}（${activeCount} 个处理中）`
  }
  return `已完成 ${completed}/${total}`
}

/** Banner 用：活动文件的当前阶段一行摘要 */
export function summarizeActiveStage(path: string, stages?: IngestStage[]): string {
  const name = path.replace(/\\/g, '/').split('/').pop() ?? path
  const running = stages?.find((s) => s.status === 'running')
  if (!running) return name
  return running.detail ? `${name} · ${running.label} (${running.detail})` : `${name} · ${running.label}`
}

let pptMutexChain: Promise<void> = Promise.resolve()

async function withPptMutex<T>(path: string, fn: () => Promise<T>): Promise<T> {
  if (!isPptPath(path)) return fn()
  const prev = pptMutexChain
  let release!: () => void
  pptMutexChain = new Promise<void>((resolve) => {
    release = resolve
  })
  await prev
  try {
    return await fn()
  } finally {
    release()
  }
}

async function heartbeat(): Promise<void> {
  const { getStatus } = await import('../api/bridge')
  await getStatus()
}

export class IngestInterruptedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IngestInterruptedError'
  }
}

export interface IngestJobRunnerOptions {
  queue: string[]
  startIndex?: number
  skipCompleted?: Set<string>
  signal?: AbortSignal
  onPatch: (patch: Record<string, unknown>) => void
}

function taskResultMessage(status: IngestTaskStatusResponse): IngestStructuredResult {
  if (status.result) return parseIngestResult(status.result)
  return {
    message: status.message,
    stages: status.stages ?? [],
    error: status.error,
  }
}

/** 后台并行摄入 — 去重、保活、轮询阶段进度 */
export async function runBackgroundIngestJob(options: IngestJobRunnerOptions): Promise<void> {
  const { queue, startIndex = 0, skipCompleted = new Set(), signal, onPatch } = options

  let ok = 0
  let failed = 0
  let skipped = 0
  let completed = 0
  let lastBeat = Date.now()
  let nextIndex = startIndex

  const activePaths = new Set<string>()
  const activeStagesByPath: Record<string, IngestStage[]> = {}

  const syncActive = () => {
    onPatch({
      activePaths: [...activePaths],
      activeStagesByPath: { ...activeStagesByPath },
      currentPath: activePaths.size === 1 ? [...activePaths][0] : '',
      currentIndex: completed,
      phaseMessage: buildPhaseMessage(completed, queue.length, activePaths.size),
    })
  }

  onPatch({
    status: 'running',
    total: queue.length,
    startedAt: Date.now(),
    lastHeartbeat: Date.now(),
    activePaths: [],
    activeStagesByPath: {},
    phaseMessage: queue.length > 0 ? `共 ${queue.length} 个文件` : '准备同步',
  })

  const maybeHeartbeat = async () => {
    if (Date.now() - lastBeat <= HEARTBEAT_MS) return
    await heartbeat()
    onPatch({ lastHeartbeat: Date.now() })
    lastBeat = Date.now()
  }

  const processOne = async (path: string): Promise<void> => {
    if (signal?.aborted) throw new IngestInterruptedError('摄入已取消')

    try {
      await maybeHeartbeat()
    } catch (e) {
      throw new IngestInterruptedError(formatIngestError(e))
    }

    if (skipCompleted.has(path)) {
      skipped++
      completed++
      onPatch({
        currentIndex: completed,
        skipped,
        logs: [{ path, status: 'skipped', message: '已完成（跳过）' }],
        phaseMessage: buildPhaseMessage(completed, queue.length, activePaths.size),
      })
      return
    }

    try {
      const freshPlan = await getPipelinePlan('all')
      if (!isPathStillPending(path, freshPlan.scan)) {
        skipped++
        completed++
        onPatch({
          currentIndex: completed,
          skipped,
          logs: [{ path, status: 'skipped', message: '已是最新（跳过）' }],
          phaseMessage: buildPhaseMessage(completed, queue.length, activePaths.size),
        })
        return
      }
    } catch (e) {
      throw new IngestInterruptedError(formatIngestError(e))
    }

    const initialStages = anticipatedStages(path)
    activePaths.add(path)
    activeStagesByPath[path] = initialStages
    syncActive()
    onPatch({ logs: [{ path, status: 'running', stages: initialStages }] })

    try {
      await withPptMutex(path, async () => {
        const startRes = await ingestFileStart(path)
        if (signal?.aborted) throw new IngestInterruptedError('摄入已取消')
        if (startRes.status === 'error' || !startRes.task_id) {
          throw new Error(startRes.error ?? '摄入启动失败')
        }

        const finalStatus = await waitIngestTask(startRes.task_id, {
          signal,
          pollMs: POLL_MS,
          onProgress: (st) => {
            if (st.stages?.length) {
              activeStagesByPath[path] = st.stages
              syncActive()
              onPatch({ logs: [{ path, status: 'running', stages: st.stages }] })
            }
          },
        })

        if (signal?.aborted) throw new IngestInterruptedError('摄入已取消')

        const parsed = taskResultMessage(finalStatus)
        const stages = parsed.stages ?? activeStagesByPath[path] ?? initialStages

        if (finalStatus.status === 'error') {
          failed++
          const msg = finalStatus.error ?? parsed.error ?? '摄入失败'
          onPatch({
            failed,
            logs: [{ path, status: 'failed', message: msg, stages }],
          })
          return
        }

        ok++
        onPatch({
          ok,
          logs: [
            {
              path,
              status: 'ok',
              message: parsed.message ?? finalStatus.message,
              stages,
            },
          ],
        })
      })
    } catch (e) {
      if (signal?.aborted) throw new IngestInterruptedError('摄入已取消')
      failed++
      onPatch({
        failed,
        logs: [
          {
            path,
            status: 'failed',
            message: formatIngestError(e),
            stages: activeStagesByPath[path] ?? initialStages,
          },
        ],
      })
    } finally {
      activePaths.delete(path)
      delete activeStagesByPath[path]
      completed++
      syncActive()
    }
  }

  const worker = async () => {
    for (;;) {
      if (signal?.aborted) throw new IngestInterruptedError('摄入已取消')
      const i = nextIndex++
      if (i >= queue.length) break
      await processOne(queue[i])
    }
  }

  const workers = Math.min(INGEST_CONCURRENCY, Math.max(queue.length - startIndex, 0))
  if (workers > 0) {
    await Promise.all(Array.from({ length: workers }, () => worker()))
  }

  if (isVaultMode()) {
    await useVaultStore.getState().refreshTree()
  }

  onPatch({
    activePaths: [],
    activeStagesByPath: {},
    currentPath: '',
    currentStages: anticipatedIndexStages().map((s) =>
      s.id === 'index_sync' ? { ...s, status: 'running' as const } : s,
    ),
    phaseMessage: '文档处理完成，索引 · 图谱 · 主题…',
  })

  try {
    const { summary: indexSummary, stages } = await runPostIngestPipeline(onPatch)
    const summary =
      queue.length > 0
        ? `文件 ${ok}/${queue.length} 成功${failed ? `，${failed} 失败` : ''}${skipped ? `，${skipped} 跳过` : ''}${indexSummary ? `；${indexSummary}` : ''}`
        : indexSummary || '已全部同步'

    onPatch({
      status: 'done',
      summary,
      phaseMessage: '',
      currentPath: '',
      currentStages: stages,
      logs: [
        {
          path: '— 索引 · 图谱 · 主题',
          status: 'ok',
          message: indexSummary,
          stages,
        },
      ],
    })
  } catch (e) {
    throw new IngestInterruptedError(formatIngestError(e))
  }
}

/** 摄入前确认后端可达 */
export async function ensureIngestBackend(): Promise<void> {
  const ok = await testPythonConnection()
  if (!ok) {
    throw new Error('Failed to fetch')
  }
}

export interface PostIngestPipelineOptions {
  embed?: boolean
  entities?: boolean
  graph?: boolean
  topics?: boolean
  onPatch?: (patch: Record<string, unknown>) => void
}

/** 实体/wiki 页变更后轻量收尾：默认索引 + 建图，不嵌向量、不刷 topic */
export async function refreshWikiIndex(
  options?: Omit<PostIngestPipelineOptions, 'embed' | 'graph' | 'topics'> & {
    embed?: boolean
    graph?: boolean
    topics?: boolean
  },
): Promise<IndexPipelineResult> {
  return runPostIngestPipeline({
    embed: options?.embed ?? false,
    graph: options?.graph ?? true,
    topics: options?.topics ?? false,
    onPatch: options?.onPatch,
  })
}

/** 批量摄入收尾：分步 sync / embed / graph / topic，并更新可视化阶段 */
export async function runPostIngestPipeline(
  onPatchOrOptions?: ((patch: Record<string, unknown>) => void) | PostIngestPipelineOptions,
): Promise<IndexPipelineResult> {
  const opts: PostIngestPipelineOptions =
    typeof onPatchOrOptions === 'function'
      ? { onPatch: onPatchOrOptions }
      : (onPatchOrOptions ?? {})
  const { embed = true, entities = true, graph = true, topics = true, onPatch } = opts

  await ensureIngestBackend()

  let stages = anticipatedIndexStages()
  const push = (phaseMessage: string) => {
    onPatch?.({
      currentPath: '',
      currentStages: cloneStages(stages),
      phaseMessage,
    })
  }

  // 1. 同步索引
  stages = setStageRunning(stages, 'index_sync')
  push('同步文档索引…')
  let res = await assertSyncOk(
    await runVaultSync({ embed: false, entities: false, graph: false, topics: false }),
    '索引同步',
  )
  stages = setStage(stages, 'index_sync', 'ok', syncDetail(res))
  const entityMdPaths = dirtySourceMdPaths(res)

  // 2. 向量嵌入
  if (embed) {
    stages = setStageRunning(stages, 'embed')
    push('向量嵌入…')
    res = await assertSyncOk(
      await runVaultSync({ embed: true, entities: false, graph: false, topics: false }),
      '向量嵌入',
    )
    if (res.embed_error) {
      stages = setStage(stages, 'embed', 'failed', String(res.embed_error))
    } else if (res.embed_result) {
      stages = setStage(stages, 'embed', 'ok', '已完成')
    } else {
      stages = setStage(stages, 'embed', 'skipped', '无待嵌入')
    }
  } else {
    stages = setStage(stages, 'embed', 'skipped', '未请求')
  }

  // 3. 实体抽取（变更的源 .md）
  if (entities && entityMdPaths.length > 0) {
    stages = setStageRunning(stages, 'entities')
    push('实体抽取…')
    res = await assertSyncOk(
      await runVaultSync({
        embed: false,
        entities: true,
        entity_paths: entityMdPaths,
        graph: false,
        topics: false,
      }),
      '实体抽取',
    )
    const ed = entitiesDetail(res)
    stages = setStage(stages, 'entities', ed.status, ed.detail)
  } else if (entities) {
    stages = setStage(stages, 'entities', 'skipped', '无变更 md')
  } else {
    stages = setStage(stages, 'entities', 'skipped', '未请求')
  }

  // 3b. 零 LLM 实体维护（修剪失效 sources / 删孤儿）
  if (graph || topics) {
    try {
      const plan = await getPipelinePlan('all')
      if ((plan.maintenance_count ?? 0) > 0) {
        await runPipelineEntityMaintain()
      }
    } catch {
      // 维护失败不阻断图谱重建
    }
  }

  // 4–5. 图谱 + 主题（须同一请求：topic 依赖本次 graph 的 communities）
  if (graph || topics) {
    stages = setStageRunning(stages, 'graph')
    push(topics ? '重建知识图谱并生成主题…' : '重建知识图谱…')
    res = await assertSyncOk(
      await runVaultSync({ embed: false, entities: false, graph: graph, topics }),
      '图谱与主题',
    )
    const gd = graphDetail(res.graph_result)
    stages = setStage(stages, 'graph', graph ? gd.status : 'skipped', graph ? gd.detail : '未请求')
    const td = topicsDetail(res)
    stages = setStage(stages, 'topics', topics ? td.status : 'skipped', topics ? td.detail : '未请求')
  } else {
    stages = setStage(stages, 'graph', 'skipped', '未请求')
    stages = setStage(stages, 'topics', 'skipped', '未请求')
  }

  push('')
  const summary = summaryFromStages(stages)
  return { summary, stages }
}
