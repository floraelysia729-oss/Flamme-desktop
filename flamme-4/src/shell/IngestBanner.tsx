import { AlertTriangle, Check, Flame, Loader2, X } from 'lucide-react'
import { useIngestStore, formatJobStatusMessage } from '../ingest/store'
import { summarizeActiveStage } from '../shared/ingest'
import IngestStageList from './IngestStageList'

/** 后台摄入浮动条 — 关闭面板后仍可查看进度 */
export default function IngestBanner() {
  const job = useIngestStore((s) => s.job)
  const panelOpen = useIngestStore((s) => s.panelOpen)
  const bannerDismissed = useIngestStore((s) => s.bannerDismissed)
  const setPanelOpen = useIngestStore((s) => s.setPanelOpen)
  const dismissBanner = useIngestStore((s) => s.dismissBanner)
  const resumeJob = useIngestStore((s) => s.resumeJob)
  const cancelJob = useIngestStore((s) => s.cancelJob)
  const resetJob = useIngestStore((s) => s.resetJob)

  const visible =
    !panelOpen &&
    !bannerDismissed &&
    (job.status === 'running' || job.status === 'interrupted' || job.status === 'done')

  if (!visible) return null

  const progressPct = job.total > 0 ? Math.round((job.currentIndex / job.total) * 100) : 0

  return (
    <div
      className="fixed bottom-5 right-5 z-[550] w-[min(100vw-2rem,340px)] glass-panel-sm rounded-2xl p-3 shadow-lg border border-white/10"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-2 mb-2">
        {job.status === 'running' ? (
          <Loader2 size={16} className="animate-spin text-[var(--accent)] shrink-0 mt-0.5" />
        ) : job.status === 'interrupted' ? (
          <AlertTriangle size={16} className="text-[var(--danger)] shrink-0 mt-0.5" />
        ) : (
          <Check size={16} className="text-[var(--success)] shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-[var(--ink)] flex items-center gap-1">
            <Flame size={12} />
            文档摄入
            {job.status === 'running' && (
              <span className="text-[9px] text-[var(--ink-muted)] font-normal ml-1">后台运行中</span>
            )}
          </p>
          <p className="text-[10px] text-[var(--ink-muted)] leading-relaxed mt-0.5 truncate">
            {formatJobStatusMessage(job)}
          </p>
        </div>
        <button
          type="button"
          className="tool-btn p-1 rounded-lg shrink-0"
          onClick={dismissBanner}
          title="隐藏（摄入继续在后台）"
        >
          <X size={14} />
        </button>
      </div>

      {job.status === 'running' && job.total > 0 && (
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%`, background: 'var(--accent)' }}
            />
          </div>
          <span className="text-[9px] text-[var(--ink-muted)] tabular-nums">
            {job.currentIndex}/{job.total}
          </span>
        </div>
      )}

      {job.status === 'running' && job.activePaths.length > 0 && (
        <div className="mb-2 pl-0.5 border-t border-white/10 pt-1.5 space-y-1">
          {job.activePaths.slice(0, 2).map((p) => (
            <p key={p} className="text-[9px] text-[var(--ink-muted)] truncate">
              {summarizeActiveStage(p, job.activeStagesByPath[p])}
            </p>
          ))}
          {job.activePaths.length > 2 && (
            <p className="text-[9px] text-[var(--ink-muted)]">+{job.activePaths.length - 2} 个并行</p>
          )}
        </div>
      )}
      {job.status === 'running' &&
        job.activePaths.length === 0 &&
        job.currentStages.length > 0 && (
          <div className="mb-2 pl-0.5 border-t border-white/10 pt-1.5">
            <IngestStageList stages={job.currentStages} compact />
          </div>
        )}

      <div className="flex justify-end gap-2 flex-wrap">
        {job.status === 'interrupted' && (
          <>
            <button
              type="button"
              className="px-2 py-1 rounded-lg text-[10px] text-[var(--ink-muted)] border border-white/15"
              onClick={() => resetJob()}
            >
              放弃
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
        {job.status === 'running' && (
          <>
            <button
              type="button"
              className="px-2 py-1 rounded-lg text-[10px] text-[var(--ink-muted)] hover:bg-white/5"
              onClick={() => setPanelOpen(true)}
            >
              详情
            </button>
            <button
              type="button"
              className="px-2 py-1 rounded-lg text-[10px] text-[var(--danger)] border border-[var(--danger)]/30"
              onClick={cancelJob}
            >
              取消
            </button>
          </>
        )}
        {job.status === 'done' && (
          <button
            type="button"
            className="px-2.5 py-1 rounded-lg text-[10px] font-semibold text-[var(--ink)] border border-white/15"
            onClick={() => {
              resetJob()
              dismissBanner()
            }}
          >
            知道了
          </button>
        )}
      </div>
    </div>
  )
}
