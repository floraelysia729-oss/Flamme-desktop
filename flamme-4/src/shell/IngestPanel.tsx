import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Flame, Loader2, X as XIcon } from 'lucide-react'
import { useIngestStore, formatJobStatusMessage } from '../ingest/store'
import {
  canIngest,
  collectPendingPaths,
  formatIngestError,
  formatPlanSummary,
} from '../shared/ingest'
import IngestStageList from './IngestStageList'

interface PopoverPos {
  top: number
  left: number
}

interface Props {
  variant?: 'icon' | 'text'
  disabled?: boolean
  onComplete?: () => void
}

export default function IngestPanel({ variant = 'icon', disabled = false, onComplete }: Props) {
  const job = useIngestStore((s) => s.job)
  const panelOpen = useIngestStore((s) => s.panelOpen)
  const setPanelOpen = useIngestStore((s) => s.setPanelOpen)
  const checkPlan = useIngestStore((s) => s.checkPlan)
  const backfillEntities = useIngestStore((s) => s.backfillEntities)
  const entityBackfillLimit = useIngestStore((s) => s.entityBackfillLimit)
  const maintainEntities = useIngestStore((s) => s.maintainEntities)
  const rebuildGraphTopics = useIngestStore((s) => s.rebuildGraphTopics)
  const startJob = useIngestStore((s) => s.startJob)
  const resumeJob = useIngestStore((s) => s.resumeJob)
  const cancelJob = useIngestStore((s) => s.cancelJob)
  const resetJob = useIngestStore((s) => s.resetJob)

  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState('')
  const [showPaths, setShowPaths] = useState(false)
  const [pos, setPos] = useState<PopoverPos>({ top: 0, left: 0 })
  const panelRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const logEndRef = useRef<HTMLDivElement>(null)

  const enabled = canIngest() && !disabled
  const running = job.status === 'running'
  const busy = checking || running

  const updatePos = useCallback(() => {
    const btn = btnRef.current
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    const panelW = 340
    const gap = 6
    let left = variant === 'text' ? rect.left : rect.right - panelW
    left = Math.max(8, Math.min(left, window.innerWidth - panelW - 8))
    setPos({ top: rect.bottom + gap, left })
  }, [variant])

  const runCheck = useCallback(async () => {
    setChecking(true)
    setCheckError('')
    try {
      await checkPlan()
    } catch (e) {
      setCheckError(formatIngestError(e))
    } finally {
      setChecking(false)
    }
  }, [checkPlan])

  const handleOpen = useCallback(() => {
    if (!enabled) return
    updatePos()
    setPanelOpen(true)
    if (job.status === 'idle' || job.status === 'done') {
      void runCheck()
    }
  }, [enabled, updatePos, setPanelOpen, job.status, runCheck])

  const closePanel = useCallback(() => {
    setPanelOpen(false)
    setShowPaths(false)
    if (job.status === 'idle') resetJob()
  }, [setPanelOpen, job.status, resetJob])

  const handleStart = useCallback(async () => {
    if (!job.plan) return
    await startJob(job.plan)
  }, [job.plan, startJob])

  useEffect(() => {
    if (job.status === 'done') onComplete?.()
  }, [job.status, onComplete])

  useLayoutEffect(() => {
    if (!panelOpen) return
    updatePos()
  }, [panelOpen, updatePos, job.logs.length, job.currentStages.length])

  useEffect(() => {
    if (running) logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [job.logs, running])

  useEffect(() => {
    if (!panelOpen) return
    const onResize = () => updatePos()
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
    }
  }, [panelOpen, updatePos])

  useEffect(() => {
    if (!panelOpen) return
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return
      closePanel()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePanel()
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [panelOpen, closePanel])

  const plan = job.plan
  const pendingPaths = plan ? collectPendingPaths(plan) : []
  const ready = !running && !checking && plan && plan.pending_count > 0 && job.status !== 'interrupted'
  const indexReady =
    !running && !checking && plan && plan.pending_count === 0 && job.status !== 'interrupted'
  const entityBackfillCount = plan?.entity_pending_count ?? plan?.scan.missing_entity_extract_count ?? 0
  const entityMaintainCount = plan?.maintenance_count ?? 0
  const entityBackfillBatch = Math.min(entityBackfillCount, entityBackfillLimit)
  const entityBackfillReady = indexReady && entityBackfillCount > 0
  const entityBackfillRunning =
    running && job.currentStages.some((s) => s.id === 'entities' && s.status === 'running')
  const entityMaintainReady =
    indexReady && entityMaintainCount > 0 && job.status !== 'interrupted'
  const progressPct = job.total > 0 ? Math.round((job.currentIndex / job.total) * 100) : 0
  const message =
    checkError ||
    (checking ? '正在扫描 Vault…' : formatJobStatusMessage(job)) ||
    (plan && plan.pending_count === 0 ? '源文件已同步，可重建图谱与主题' : '')

  const popover =
    panelOpen &&
    createPortal(
      <div
        ref={panelRef}
        className="ctx-menu glass-panel-sm fixed z-[600] rounded-2xl p-3 w-[340px] shadow-lg max-h-[min(70vh,480px)] flex flex-col"
        style={{ top: pos.top, left: pos.left }}
        role="dialog"
        aria-label="文档摄入"
      >
        <p className="text-[11px] font-medium text-[var(--ink)] mb-1 shrink-0">文档摄入</p>
        <p className="text-[10px] text-[var(--ink-muted)] leading-relaxed mb-2 shrink-0">{message}</p>

        {running && (
          <div className="mb-2 space-y-1.5 shrink-0">
            {(job.total > 0 || job.currentStages.length > 0) && (
              <div className="flex items-center gap-2">
                {job.total > 0 ? (
                  <>
                    <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{ width: `${progressPct}%`, background: 'var(--accent)' }}
                      />
                    </div>
                    <span className="text-[9px] text-[var(--ink-muted)] tabular-nums shrink-0">
                      {job.currentIndex}/{job.total}
                    </span>
                  </>
                ) : (
                  <span className="text-[9px] text-[var(--ink-muted)]">收尾管道</span>
                )}
              </div>
            )}
            {job.activePaths.length > 0 ? (
              <ul className="space-y-1.5 max-h-36 overflow-y-auto">
                {job.activePaths.map((p) => {
                  const stages = job.activeStagesByPath[p] ?? []
                  const name = p.replace(/\\/g, '/').split('/').pop() ?? p
                  return (
                    <li
                      key={p}
                      className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5"
                    >
                      <p className="text-[9px] font-mono text-[var(--ink-muted)] truncate mb-1" title={p}>
                        {name}
                      </p>
                      {stages.length > 0 && <IngestStageList stages={stages} compact />}
                    </li>
                  )
                })}
              </ul>
            ) : (
              job.currentStages.length > 0 && <IngestStageList stages={job.currentStages} />
            )}
          </div>
        )}

        {job.logs.length > 0 && (
          <ul className="flex-1 min-h-0 overflow-y-auto text-[9px] font-mono space-y-1 border-t border-white/10 pt-1.5 mb-2">
            {job.logs.map((entry, i) => (
              <li key={`${entry.path}-${i}`} className="space-y-0.5">
                <div className="flex items-start gap-1 truncate" title={entry.message ?? entry.path}>
                  {entry.status === 'running' && (
                    <Loader2 size={10} className="animate-spin shrink-0 mt-0.5 text-[var(--accent)]" />
                  )}
                  {entry.status === 'ok' && (
                    <Check size={10} className="shrink-0 mt-0.5 text-[var(--success)]" />
                  )}
                  {entry.status === 'failed' && (
                    <XIcon size={10} className="shrink-0 mt-0.5 text-[var(--danger)]" />
                  )}
                  {entry.status === 'skipped' && (
                    <span className="text-[var(--ink-muted)] shrink-0">−</span>
                  )}
                  <span className="truncate text-[var(--ink-muted)]">{entry.path}</span>
                </div>
                {entry.stages && entry.stages.length > 0 && (
                  <div className="pl-4">
                    <IngestStageList stages={entry.stages} compact />
                  </div>
                )}
              </li>
            ))}
            <div ref={logEndRef} />
          </ul>
        )}

        {ready && pendingPaths.length > 0 && (
          <div className="mb-2 shrink-0">
            <button
              type="button"
              className="text-[10px] text-[var(--accent)] hover:underline"
              onClick={() => setShowPaths((v) => !v)}
            >
              {showPaths ? '收起' : `待处理 ${plan?.pending_count ?? 0} 项（已去重）`}
            </button>
            {showPaths && (
              <ul className="mt-1 max-h-20 overflow-y-auto text-[9px] text-[var(--ink-muted)] font-mono space-y-0.5">
                {pendingPaths.map((p) => (
                  <li key={p} className="truncate" title={p}>
                    {p}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 flex-wrap shrink-0">
          {running ? (
            <>
              <button
                type="button"
                className="px-2 py-1 rounded-lg text-[10px] text-[var(--ink-muted)]"
                onClick={closePanel}
              >
                后台继续
              </button>
              <button
                type="button"
                className="px-2 py-1 rounded-lg text-[10px] text-[var(--danger)] border border-[var(--danger)]/30"
                onClick={cancelJob}
              >
                取消
              </button>
            </>
          ) : (
            <button
              type="button"
              className="px-2 py-1 rounded-lg text-[10px] text-[var(--ink-muted)] hover:bg-white/5"
              onClick={closePanel}
            >
              关闭
            </button>
          )}
          {ready && (
            <button
              type="button"
              className="px-2.5 py-1 rounded-lg text-[10px] font-semibold text-white disabled:opacity-40"
              style={{ background: 'var(--accent)' }}
              onClick={() => void handleStart()}
              disabled={busy}
            >
              开始摄入
            </button>
          )}
          {entityBackfillReady && !entityBackfillRunning && (
            <button
              type="button"
              className="px-2.5 py-1 rounded-lg text-[10px] font-semibold text-white disabled:opacity-40"
              style={{ background: 'var(--accent)' }}
              onClick={() => void backfillEntities()}
              disabled={busy}
              title={`单次上限 ${entityBackfillLimit} 篇（设置 → 后端可改）`}
            >
              补跑实体（{entityBackfillBatch}/{entityBackfillCount}）
            </button>
          )}
          {entityMaintainReady && (
            <button
              type="button"
              className="px-2.5 py-1 rounded-lg text-[10px] font-semibold text-[var(--ink)] border border-white/20 disabled:opacity-40"
              onClick={() => void maintainEntities()}
              disabled={busy}
            >
              清理实体
            </button>
          )}
          {indexReady && (
            <button
              type="button"
              className="px-2.5 py-1 rounded-lg text-[10px] font-semibold text-white disabled:opacity-40"
              style={{ background: 'var(--accent)' }}
              onClick={() => void rebuildGraphTopics()}
              disabled={busy}
            >
              重建图谱与主题
            </button>
          )}
          {job.status === 'interrupted' && (
            <>
              <button
                type="button"
                className="px-2 py-1 rounded-lg text-[10px] text-[var(--ink-muted)] border border-white/15"
                onClick={() => void runCheck()}
              >
                重新检查
              </button>
              <button
                type="button"
                className="px-2.5 py-1 rounded-lg text-[10px] font-semibold text-white"
                style={{ background: 'var(--accent)' }}
                onClick={() => void resumeJob()}
              >
                继续摄入
              </button>
            </>
          )}
        </div>
      </div>,
      document.body,
    )

  return (
    <>
      {variant === 'icon' ? (
        <button
          ref={btnRef}
          type="button"
          className={`tool-btn tool-btn--icon disabled:opacity-40 relative ${running ? 'ring-1 ring-[var(--accent)]/50' : ''}`}
          onClick={handleOpen}
          disabled={!enabled || checking}
          title={enabled ? '检查并摄入（可后台运行）' : '请先连接后端并选择 Vault'}
        >
          <Flame size={16} strokeWidth={2.25} className={running ? 'text-[var(--accent)]' : ''} />
          {running && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
          )}
        </button>
      ) : (
        <button
          ref={btnRef}
          type="button"
          className="px-3 py-1 rounded-lg text-[10px] font-semibold text-[var(--ink)] border border-white/15 hover:bg-white/5 disabled:opacity-40"
          onClick={() => {
            if (!enabled) return
            updatePos()
            setPanelOpen(true)
            if (job.status === 'idle' || job.status === 'done') {
              void runCheck()
            }
          }}
          disabled={!enabled || checking || running}
        >
          {running ? `后台 ${job.currentIndex}/${job.total}` : checking ? '检查中…' : '检查摄入'}
        </button>
      )}
      {popover}
    </>
  )
}
