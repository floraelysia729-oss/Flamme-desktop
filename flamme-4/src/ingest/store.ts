import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  getPipelinePlan,
  runPipelineBackfillEntities,
  runPipelineEntityMaintain,
} from '../api/bridge'
import type { IngestStage, PipelinePlan } from '../api/types'
import { useVaultStore } from '../vault/store'
import { isVaultMode } from '../files'
import {
  buildIngestQueue,
  clampEntityBackfillLimit,
  DEFAULT_ENTITY_BACKFILL_LIMIT,
  formatIngestError,
  formatPlanSummary,
  runBackgroundIngestJob,
  runPostIngestPipeline,
  ensureIngestBackend,
  anticipatedIndexStages,
  summarizeActiveStage,
  type IngestFileLog,
} from '../shared/ingest'
import type { EntityBackfillPathResult, PipelineRunResponse } from '../api/types'

export type IngestJobStatus = 'idle' | 'running' | 'interrupted' | 'done' | 'error'

export interface IngestJob {
  status: IngestJobStatus
  plan: PipelinePlan | null
  queue: string[]
  currentIndex: number
  total: number
  currentPath: string
  currentStages: IngestStage[]
  activePaths: string[]
  activeStagesByPath: Record<string, IngestStage[]>
  logs: IngestFileLog[]
  ok: number
  failed: number
  skipped: number
  phaseMessage: string
  summary: string
  errorMessage: string
  startedAt: number | null
  lastHeartbeat: number | null
  completedPaths: string[]
}

const emptyJob = (): IngestJob => ({
  status: 'idle',
  plan: null,
  queue: [],
  currentIndex: 0,
  total: 0,
  currentPath: '',
  currentStages: [],
  activePaths: [],
  activeStagesByPath: {},
  logs: [],
  ok: 0,
  failed: 0,
  skipped: 0,
  phaseMessage: '',
  summary: '',
  errorMessage: '',
  startedAt: null,
  lastHeartbeat: null,
  completedPaths: [],
})

let abortController: AbortController | null = null
let runnerActive = false

interface IngestStore {
  job: IngestJob
  panelOpen: boolean
  bannerDismissed: boolean
  entityBackfillLimit: number
  setEntityBackfillLimit: (limit: number) => void
  setPanelOpen: (open: boolean) => void
  dismissBanner: () => void
  resetJob: () => void
  checkPlan: () => Promise<PipelinePlan>
  checkAndRebuild: () => Promise<void>
  backfillEntities: (limit?: number) => Promise<void>
  maintainEntities: () => Promise<void>
  startJob: (plan: PipelinePlan) => Promise<void>
  rebuildGraphTopics: () => Promise<void>
  resumeJob: () => Promise<void>
  cancelJob: () => void
  recoverAfterReload: () => void
}

function mergeLog(prev: IngestFileLog[], entry: IngestFileLog): IngestFileLog[] {
  const rest = prev.filter((l) => !(l.path === entry.path && l.status === 'running'))
  return [...rest, entry]
}

function mergeLogs(prev: IngestFileLog[], entries: IngestFileLog[]): IngestFileLog[] {
  return entries.reduce((acc, e) => mergeLog(acc, e), prev)
}

function entityStepFrom(res: PipelineRunResponse) {
  return res.steps?.find((s) => s.step === 'entities')
}

function pathLabel(relpath: string): string {
  return relpath.replace(/\\/g, '/').split('/').pop() ?? relpath
}

function logMessageForPath(result: EntityBackfillPathResult | undefined): string {
  if (!result) return '已完成'
  if (result.error) return result.error
  if (result.skipped) return result.reason ?? '已跳过'
  if ((result.entity_count ?? 0) > 0) return `${result.entity_count} 个实体`
  return '未识别术语'
}

async function executeJob(
  get: () => IngestStore,
  set: (partial: Partial<IngestStore> | ((s: IngestStore) => Partial<IngestStore>)) => void,
  opts: { resume?: boolean } = {},
) {
  if (runnerActive) return
  runnerActive = true
  abortController = new AbortController()

  const job = get().job
  const queue = job.queue.length > 0 ? job.queue : job.plan ? buildIngestQueue(job.plan) : []
  const skipCompleted = new Set(
    opts.resume
      ? job.logs.filter((l) => l.status === 'ok' || l.status === 'skipped').map((l) => l.path)
      : [],
  )

  set({
    bannerDismissed: false,
    job: {
      ...job,
      status: 'running',
      queue,
      total: queue.length,
      errorMessage: '',
      phaseMessage: '准备摄入…',
    },
  })

  try {
    await runBackgroundIngestJob({
      queue,
      startIndex: 0,
      skipCompleted,
      signal: abortController.signal,
      onPatch: (patch) => {
        set((s) => {
          const j = s.job
          const logPatch = patch.logs as IngestFileLog[] | undefined
          const completedAdd =
            logPatch?.filter((l) => l.status === 'ok').map((l) => l.path) ?? []
          return {
            job: {
              ...j,
              ...patch,
              logs: logPatch ? mergeLogs(j.logs, logPatch) : j.logs,
              completedPaths: [...new Set([...j.completedPaths, ...completedAdd])],
            } as IngestJob,
          }
        })
      },
    })

    if (isVaultMode()) {
      await useVaultStore.getState().refreshTree()
    }
  } catch (e) {
    const cancelled = abortController?.signal.aborted
    set((s) => ({
      job: {
        ...s.job,
        status: 'interrupted',
        errorMessage: cancelled
          ? '已手动取消，可点击「继续摄入」从断点恢复'
          : formatIngestError(e),
        phaseMessage: '',
        currentPath: '',
        currentStages: [],
        activePaths: [],
        activeStagesByPath: {},
      },
      bannerDismissed: false,
    }))
  } finally {
    runnerActive = false
    abortController = null
  }
}

export const useIngestStore = create<IngestStore>()(
  persist(
    (set, get) => ({
      job: emptyJob(),
      panelOpen: false,
      bannerDismissed: false,
      entityBackfillLimit: DEFAULT_ENTITY_BACKFILL_LIMIT,

      setEntityBackfillLimit: (limit) =>
        set({ entityBackfillLimit: clampEntityBackfillLimit(limit) }),

      setPanelOpen: (open) => set({ panelOpen: open }),

      dismissBanner: () => set({ bannerDismissed: true }),

      resetJob: () => set({ job: emptyJob(), bannerDismissed: false }),

      recoverAfterReload: () => {
        const { job } = get()
        if (job.status === 'running') {
          set({
            job: {
              ...job,
              status: 'interrupted',
              errorMessage: '页面刷新或意外关闭导致摄入中断，请点击「继续摄入」',
              phaseMessage: '',
              currentPath: '',
              currentStages: [],
              activePaths: [],
              activeStagesByPath: {},
            },
            bannerDismissed: false,
          })
        }
      },

      checkPlan: async () => {
        await ensureIngestBackend()
        const plan = await getPipelinePlan('all')
        const queue = buildIngestQueue(plan)
        set((s) => ({
          job: {
            ...s.job,
            plan,
            queue,
            total: queue.length,
          },
        }))
        return plan
      },

      /** 检查摄入：有待处理文件则摄入，否则仅刷新计划（不自动重建图谱） */
      checkAndRebuild: async () => {
        const plan = await get().checkPlan()
        const queue = buildIngestQueue(plan)
        if (queue.length > 0) {
          await get().startJob(plan)
        }
      },

      backfillEntities: async (limit) => {
        if (runnerActive) return
        const plan = get().job.plan
        const pending =
          plan?.entity_pending_count ?? plan?.scan.missing_entity_extract_count ?? 0
        const batchLimit = clampEntityBackfillLimit(
          limit ?? get().entityBackfillLimit ?? DEFAULT_ENTITY_BACKFILL_LIMIT,
        )
        const batchTotal = Math.min(pending, batchLimit)
        if (batchTotal <= 0) return

        runnerActive = true
        abortController = new AbortController()
        const entityStage: IngestStage = {
          id: 'entities',
          label: '实体抽取',
          status: 'running',
        }

        set({
          bannerDismissed: false,
          job: {
            ...emptyJob(),
            status: 'running',
            plan,
            total: batchTotal,
            currentIndex: 0,
            currentPath: '',
            currentStages: [entityStage],
            phaseMessage: `实体补跑 0/${batchTotal}`,
            startedAt: Date.now(),
          },
        })

        let ok = 0
        let failed = 0
        let skipped = 0
        const logs: IngestFileLog[] = []

        try {
          await ensureIngestBackend()

          for (let i = 0; i < batchTotal; i++) {
            if (abortController?.signal.aborted) {
              throw new Error('实体补跑已取消')
            }

            set((s) => ({
              job: {
                ...s.job,
                currentIndex: i,
                phaseMessage: `实体补跑 ${i}/${batchTotal}…`,
                currentStages: [{ ...entityStage, status: 'running', detail: '等待后端…' }],
              },
            }))

            const res = await runPipelineBackfillEntities({ limit: 1 })
            if (res.status === 'error' || res.error) {
              throw new Error(res.error ?? '实体补跑失败')
            }

            const queued = res.paths_queued ?? 0
            const step = entityStepFrom(res)
            const pathResult = step?.paths?.[0]
            const relpath = pathResult?.path ?? `— 第 ${i + 1} 篇`
            const display = pathLabel(relpath)

            if (queued === 0) {
              set((s) => ({
                job: {
                  ...s.job,
                  currentIndex: i + 1,
                  phaseMessage: '',
                },
              }))
              break
            }

            let entryStatus: IngestFileLog['status'] = 'ok'
            if (pathResult?.error) {
              failed += 1
              entryStatus = 'failed'
            } else if (pathResult?.skipped) {
              skipped += 1
              entryStatus = 'skipped'
            } else if ((pathResult?.entity_count ?? 0) > 0) {
              ok += 1
            } else {
              skipped += 1
              entryStatus = 'skipped'
            }

            const entry: IngestFileLog = {
              path: relpath,
              status: entryStatus,
              message: logMessageForPath(pathResult),
              stages: [
                {
                  ...entityStage,
                  status: entryStatus === 'failed' ? 'failed' : entryStatus === 'skipped' ? 'skipped' : 'ok',
                  detail: logMessageForPath(pathResult),
                },
              ],
            }
            logs.push(entry)

            set((s) => ({
              job: {
                ...s.job,
                currentIndex: i + 1,
                currentPath: relpath,
                ok,
                failed,
                skipped,
                logs: [...logs],
                phaseMessage: `实体补跑 ${i + 1}/${batchTotal}：${display}`,
                currentStages: [
                  {
                    ...entityStage,
                    status: 'running',
                    detail: display,
                  },
                ],
              },
            }))
          }

          const freshPlan = await get().checkPlan()
          const remaining =
            freshPlan.entity_pending_count ??
            freshPlan.scan.missing_entity_extract_count ??
            0
          if (isVaultMode()) {
            await useVaultStore.getState().refreshTree()
          }

          const summary = `实体补跑：成功 ${ok}，跳过 ${skipped}${failed ? `，失败 ${failed}` : ''}${
            remaining > 0 ? `；尚有 ${remaining} 篇待补跑` : ''
          }`

          set({
            job: {
              ...get().job,
              status: 'done',
              plan: freshPlan,
              summary,
              phaseMessage: '',
              currentPath: '',
              currentStages: [{ ...entityStage, status: failed > 0 && ok === 0 ? 'failed' : 'ok', detail: summary }],
            },
          })
        } catch (e) {
          const cancelled = abortController?.signal.aborted
          set({
            job: {
              ...get().job,
              status: 'interrupted',
              errorMessage: cancelled
                ? '实体补跑已取消'
                : formatIngestError(e),
              phaseMessage: '',
              logs: logs.length > 0 ? logs : get().job.logs,
            },
            bannerDismissed: false,
          })
        } finally {
          runnerActive = false
          abortController = null
        }
      },

      maintainEntities: async () => {
        if (runnerActive) return
        runnerActive = true
        set({
          bannerDismissed: false,
          job: {
            ...emptyJob(),
            status: 'running',
            plan: get().job.plan,
            phaseMessage: '清理实体（零 LLM）…',
          },
        })
        try {
          await ensureIngestBackend()
          const res = await runPipelineEntityMaintain()
          if (res.status === 'error' || res.error) {
            throw new Error(res.error ?? '实体维护失败')
          }
          const plan = await get().checkPlan()
          const step = res.steps?.find((s) => s.step === 'entity_maintain') as
            | { pruned_entities?: string[]; deleted_entities?: string[] }
            | undefined
          const pruned = step?.pruned_entities?.length ?? 0
          const deleted = step?.deleted_entities?.length ?? 0
          if (isVaultMode()) {
            await useVaultStore.getState().refreshTree()
          }
          set({
            job: {
              ...get().job,
              status: 'done',
              plan,
              summary: `实体维护：修剪 ${pruned}，删除 ${deleted}`,
              phaseMessage: '',
              logs: [
                {
                  path: '— 实体维护',
                  status: 'ok',
                  message: `修剪 ${pruned}，删除 ${deleted}`,
                },
              ],
            },
          })
        } catch (e) {
          set({
            job: {
              ...get().job,
              status: 'interrupted',
              errorMessage: formatIngestError(e),
              phaseMessage: '',
            },
            bannerDismissed: false,
          })
        } finally {
          runnerActive = false
        }
      },

      rebuildGraphTopics: async () => {
        if (runnerActive) return
        runnerActive = true
        abortController = new AbortController()
        set({
          bannerDismissed: false,
          job: {
            ...emptyJob(),
            status: 'running',
            plan: get().job.plan,
            currentStages: anticipatedIndexStages().map((s) =>
              s.id === 'index_sync' ? { ...s, status: 'running' as const } : s,
            ),
            phaseMessage: '索引 · 图谱 · 主题…',
          },
        })
        try {
          const { summary, stages } = await runPostIngestPipeline((patch) => {
            set((s) => ({
              job: { ...s.job, ...patch } as IngestJob,
            }))
          })
          if (isVaultMode()) {
            await useVaultStore.getState().refreshTree()
          }
          set((s) => ({
            job: {
              ...s.job,
              status: 'done',
              summary,
              phaseMessage: '',
              currentStages: stages,
              logs: [
                {
                  path: '— 索引 · 图谱 · 主题',
                  status: 'ok',
                  message: summary,
                  stages,
                },
              ],
            },
          }))
        } catch (e) {
          set((s) => ({
            job: {
              ...s.job,
              status: 'interrupted',
              errorMessage: formatIngestError(e),
              phaseMessage: '',
            },
            bannerDismissed: false,
          }))
        } finally {
          runnerActive = false
          abortController = null
        }
      },

      startJob: async (plan) => {
        const queue = buildIngestQueue(plan)
        set({
          job: {
            ...emptyJob(),
            status: 'running',
            plan,
            queue,
            total: queue.length,
          },
          bannerDismissed: false,
        })
        await executeJob(get, set)
      },

      resumeJob: async () => {
        const { job } = get()
        if (job.status !== 'interrupted' && job.status !== 'error') return
        try {
          const plan = await getPipelinePlan('all')
          const queue = buildIngestQueue(plan)
          set({
            job: {
              ...job,
              plan,
              queue,
              total: queue.length,
              status: 'running',
              errorMessage: '',
            },
            bannerDismissed: false,
          })
          await executeJob(get, set, { resume: true })
        } catch (e) {
          set((s) => ({
            job: {
              ...s.job,
              status: 'interrupted',
              errorMessage: formatIngestError(e),
            },
          }))
        }
      },

      cancelJob: () => {
        abortController?.abort()
      },
    }),
    {
      name: 'flamme-ingest-job-v1',
      partialize: (s) => ({ job: s.job, entityBackfillLimit: s.entityBackfillLimit }),
      onRehydrateStorage: () => (state) => {
        if (state && state.entityBackfillLimit != null) {
          state.entityBackfillLimit = clampEntityBackfillLimit(state.entityBackfillLimit)
        }
        state?.recoverAfterReload()
      },
    },
  ),
)

export function formatJobStatusMessage(job: IngestJob): string {
  if (job.status === 'interrupted') return job.errorMessage || '摄入已中断'
  if (job.status === 'error') return job.errorMessage || '摄入失败'
  if (job.status === 'done') return job.summary ? `完成：${job.summary}` : '摄入完成'
  if (job.status === 'running') {
    if (job.phaseMessage) return job.phaseMessage
    if (job.total > 0 && job.currentStages.some((s) => s.id === 'entities' && s.status === 'running')) {
      const name = job.currentPath
        ? pathLabel(job.currentPath)
        : ''
      return name
        ? `实体补跑 ${job.currentIndex}/${job.total}：${name}`
        : `实体补跑 ${job.currentIndex}/${job.total}`
    }
    if (job.activePaths.length > 0) {
      const first = job.activePaths[0]
      const stages = job.activeStagesByPath[first]
      return summarizeActiveStage(first, stages)
    }
    return `正在摄入 (${job.currentIndex}/${job.total})`
  }
  if (job.plan && job.plan.pending_count === 0) {
    const ent = job.plan.entity_pending_count ?? 0
    const maint = job.plan.maintenance_count ?? 0
    if (ent > 0 || maint > 0) {
      return formatPlanSummary(job.plan)
    }
    return '源文件已同步，可重建图谱与主题'
  }
  if (job.plan) return formatPlanSummary(job.plan)
  return ''
}
