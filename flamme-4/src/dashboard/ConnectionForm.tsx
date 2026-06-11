import { useState } from 'react'
import { useTheme } from '../theme/ThemeContext'
import { useConnectionStore } from '../api/connection'
import {
  testPythonConnection,
  hasVaultForDashboard,
  pickVaultFolder,
  getStatus,
} from '../api/bridge'
import type { IngestDepMissing } from '../api/types'
import { isVaultMode } from '../files'
import { useVaultStore } from '../vault/store'
import { runPostIngestPipeline } from '../shared/ingest'
import { ChevronDown, ChevronRight, FolderOpen } from 'lucide-react'
import IngestPanel from '../shell/IngestPanel'

interface Props {
  /** 设置侧栏：始终展开、无折叠条 */
  variant?: 'collapsible' | 'settings'
  collapsed?: boolean
  onDataChanged?: () => void
}

export default function ConnectionForm({
  variant = 'collapsible',
  collapsed = false,
  onDataChanged,
}: Props) {
  const { glass } = useTheme()
  const { baseUrl, vaultPath, connected, setBaseUrl, setVaultPath } = useConnectionStore()
  const isSettings = variant === 'settings'
  const [open, setOpen] = useState(isSettings || !collapsed)
  const [testing, setTesting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [depsMissing, setDepsMissing] = useState<IngestDepMissing[]>([])

  const handleTest = async () => {
    setTesting(true)
    setSyncMsg('')
    setDepsMissing([])
    const ok = await testPythonConnection()
    if (ok) {
      try {
        const st = await getStatus()
        const missing = st.ingest_deps_missing ?? []
        setDepsMissing(missing)
        if (missing.length > 0) {
          setSyncMsg(
            `已连接，但摄入依赖未装全：${missing.map((m) => m.package).join('、')}。请在 flamme-backend 目录执行 pip install -e .`,
          )
        }
      } catch {
        /* status 解析失败不影响连接成功 */
      }
    }
    setTesting(false)
  }

  const handlePickVault = async () => {
    const path = await pickVaultFolder()
    if (!path) return
    setVaultPath(path)
    if (isVaultMode()) {
      await useVaultStore.getState().initFromVaultPath(path)
      setSyncMsg('Vault 已加载到侧栏文件树')
    }
  }

  const handleSync = async () => {
    if (!hasVaultForDashboard()) {
      setSyncMsg('请先连接并填写 Vault 绝对路径')
      return
    }
    setSyncing(true)
    setSyncMsg('正在同步索引、重建图谱并生成主题页…')
    try {
      const { summary } = await runPostIngestPipeline({
        embed: true,
        graph: true,
        topics: true,
      })
      setSyncMsg(summary ? `完成：${summary}` : '索引同步完成')
      if (isVaultMode()) {
        await useVaultStore.getState().refreshTree()
      }
      onDataChanged?.()
    } catch (e: unknown) {
      setSyncMsg(e instanceof Error ? e.message : '同步失败')
    } finally {
      setSyncing(false)
    }
  }

  const formBody = (
        <div className={`flex flex-col gap-2 ${isSettings ? '' : 'px-3 pb-3'}`}>
          <input
            className="inner-chip inner-chip-dark px-2 py-1 text-[11px] text-[var(--ink)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="http://127.0.0.1:8765/api"
          />
          <div className="flex gap-2">
            <input
              className="inner-chip inner-chip-dark flex-1 px-2 py-1 text-[11px] text-[var(--ink)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
              value={vaultPath}
              onChange={(e) => setVaultPath(e.target.value)}
              placeholder="Vault 绝对路径，如 D:/dev/LLM-WIKI/3.0/demo-vault-v2"
            />
            {isVaultMode() && (
              <button
                type="button"
                className="tool-btn px-2 py-1 rounded-lg shrink-0"
                onClick={() => void handlePickVault()}
                title="选择 Vault 文件夹"
              >
                <FolderOpen size={14} strokeWidth={2.25} />
              </button>
            )}
          </div>
          <div className="flex justify-end gap-2 flex-wrap">
            {connected && vaultPath.trim() && (
              <>
                <button
                  type="button"
                  className="px-3 py-1 rounded-lg text-[10px] font-semibold text-[var(--ink)] border border-white/15 hover:bg-white/5 disabled:opacity-40"
                  onClick={handleSync}
                  disabled={syncing || testing}
                >
                  {syncing ? '同步中…' : '同步索引'}
                </button>
                <IngestPanel
                  variant="text"
                  disabled={syncing || testing}
                  onComplete={onDataChanged}
                />
              </>
            )}
            <button
              type="button"
              className="px-3 py-1 rounded-lg text-[10px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ background: 'var(--accent)' }}
              onClick={handleTest}
              disabled={testing || syncing}
            >
              {testing ? '…' : '连接'}
            </button>
          </div>
          {syncMsg && (
            <p className="text-[10px] text-[var(--ink-muted)] leading-relaxed">{syncMsg}</p>
          )}
          {depsMissing.length > 0 && (
            <ul className="text-[9px] text-[var(--danger)]/90 space-y-0.5 leading-relaxed">
              {depsMissing.map((m) => (
                <li key={m.package}>
                  缺 {m.package}（{m.feature}）→ {m.fix}
                </li>
              ))}
            </ul>
          )}
        </div>
  )

  if (isSettings) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[var(--ink)]">连接状态</span>
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: connected ? 'var(--success)' : 'var(--danger)' }}
            title={connected ? '已连接' : '未连接'}
          />
          <span className="text-[10px] text-[var(--ink-muted)]">
            {connected ? '后端可达' : '请先测试连接'}
          </span>
        </div>
        {formBody}
      </div>
    )
  }

  return (
    <div className={`${glass.card} rounded-xl overflow-hidden`}>
      <button
        type="button"
        className="flex items-center gap-2 w-full px-3 py-2 text-[11px] text-[var(--ink)] hover:bg-white/[0.02] transition-colors"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span>后端连接</span>
        <span
          className="ml-auto w-1.5 h-1.5 rounded-full"
          style={{ background: connected ? 'var(--success)' : 'var(--danger)' }}
        />
      </button>

      {open && formBody}
    </div>
  )
}
