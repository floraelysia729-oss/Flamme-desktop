import { lazy, Suspense, useState, useEffect, useCallback } from 'react'
import { ArrowLeft, LayoutGrid, Network, Palette, Settings } from 'lucide-react'
import { useTheme } from '../theme/ThemeContext'
import { useConnectionStore } from '../api/connection'
import {
  getActivityOverview,
  getActivityHeatmap,
  getActivityDomainLinks,
  hasVaultForDashboard,
} from '../api/bridge'
import type { OverviewResponse, HeatmapEntry, DomainLink } from '../api/types'
import AppShell from '../shell/AppShell'
import ShellToolbar from '../shell/ShellToolbar'
import DashboardMosaic from './DashboardMosaic'
import DashboardOverview from './DashboardOverview'
import HeatmapGrid from './HeatmapGrid'
import KnowledgePanel from './KnowledgePanel'
import DomainLinksTile from './DomainLinksTile'

const GraphPanel = lazy(() => import('../graph/GraphPanel'))

type DashboardTab = 'overview' | 'graph'

interface Props {
  onBack: () => void
  onThemeCycle: () => void
  onOpenSettings: () => void
  onSwitchToEditor: () => void
}

export default function DashboardPage({
  onBack,
  onThemeCycle,
  onOpenSettings,
  onSwitchToEditor,
}: Props) {
  const { currentThemeName, colorMode } = useTheme()
  const { connected, vaultPath } = useConnectionStore()
  const vaultReady = hasVaultForDashboard()
  const [overview, setOverview] = useState<OverviewResponse | null>(null)
  const [domainLinks, setDomainLinks] = useState<DomainLink[]>([])
  const [heatmap, setHeatmap] = useState<HeatmapEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [animKey, setAnimKey] = useState(0)
  const [tab, setTab] = useState<DashboardTab>('overview')

  const loadDashboard = useCallback(() => {
    if (!vaultReady) return
    setLoading(true)
    setError(null)
    Promise.all([getActivityOverview(), getActivityHeatmap(365), getActivityDomainLinks()])
      .then(([ov, hm, links]) => {
        setOverview(ov)
        setHeatmap(hm)
        setDomainLinks(links.links ?? [])
        setAnimKey((k) => k + 1)
      })
      .catch((e) => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false))
  }, [vaultReady])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  const isEmpty =
    overview &&
    overview.total_docs === 0 &&
    overview.total_entities === 0 &&
    overview.domains.length === 0

  const btn = 'tool-btn p-1.5 rounded-lg'

  return (
    <AppShell variant="dashboard">
      <div
        className={`dashboard-root h-full flex flex-col min-h-0 gap-2 overflow-hidden ${colorMode === 'dark' ? 'dashboard-root--dark' : 'dashboard-root--light'}`}
      >
        <ShellToolbar
          left={
            <button type="button" className={btn} onClick={onBack} title="编辑器 (Ctrl+D)">
              <ArrowLeft size={16} strokeWidth={2.25} />
            </button>
          }
          center={
            vaultReady ? (
              <div className="flex items-center gap-1 rounded-lg p-0.5 border border-[var(--dashboard-panel-border)]">
                <button
                  type="button"
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium transition-colors ${
                    tab === 'overview'
                      ? 'bg-[var(--accent)] text-white'
                      : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                  }`}
                  onClick={() => setTab('overview')}
                >
                  <LayoutGrid size={13} />
                  概览
                </button>
                <button
                  type="button"
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium transition-colors ${
                    tab === 'graph'
                      ? 'bg-[var(--accent)] text-white'
                      : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                  }`}
                  onClick={() => setTab('graph')}
                >
                  <Network size={13} />
                  图谱
                </button>
              </div>
            ) : (
              'Dashboard'
            )
          }
          right={
            <>
              <button
                type="button"
                className={btn}
                onClick={onThemeCycle}
                title={`切换主题（${currentThemeName}，Ctrl+T）`}
              >
                <Palette size={16} strokeWidth={2.25} />
              </button>
              <button
                type="button"
                className={btn}
                onClick={onOpenSettings}
                title="设置 (Ctrl+Shift+T)"
              >
                <Settings size={16} strokeWidth={2.25} />
              </button>
            </>
          }
        />

        <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-hidden">
          {!vaultReady && (
            <div className="dashboard-panel-bubble flex-1 min-h-0 flex flex-col items-center justify-center gap-3 px-6 py-8 text-center">
              <p className="text-sm text-[var(--ink-muted)] leading-relaxed max-w-xs">
                {!connected
                  ? '请先在设置中连接本地后端。'
                  : '请在设置中填写 Vault 路径并同步索引。'}
              </p>
              <button
                type="button"
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white"
                style={{ background: 'var(--accent)' }}
                onClick={onOpenSettings}
              >
                打开设置
              </button>
            </div>
          )}

          {vaultReady && loading && (
            <div className="text-[var(--ink-muted)] text-sm text-center py-8 flex-1">加载中…</div>
          )}

          {vaultReady && error && (
            <div
              className="text-sm rounded-lg px-3 py-2 shrink-0"
              style={{
                color: 'var(--danger)',
                background: 'rgba(200,50,50,0.08)',
                border: '1px solid rgba(200,50,50,0.15)',
              }}
            >
              {error}
            </div>
          )}

          {vaultReady && isEmpty && !loading && !error && (
            <div className="dashboard-panel-bubble flex-1 min-h-0 flex flex-col items-center justify-center gap-3 px-6 py-8 text-center">
              <p className="text-sm text-[var(--ink-muted)] max-w-xs">
                索引里还没有文档数据。请在设置中点击「同步索引」。
              </p>
              <button
                type="button"
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white"
                style={{ background: 'var(--accent)' }}
                onClick={onOpenSettings}
              >
                打开设置
              </button>
            </div>
          )}

          {vaultReady && tab === 'graph' && (
            <Suspense
              fallback={
                <div className="text-[var(--ink-muted)] text-sm text-center py-8 flex-1">
                  加载图谱视图…
                </div>
              }
            >
              <GraphPanel />
            </Suspense>
          )}

          {vaultReady && tab === 'overview' && overview && !loading && !error && !isEmpty && (
            <DashboardMosaic
              overviewSlot={<DashboardOverview overview={overview} animKey={animKey} />}
              heatmapSlot={
                <HeatmapGrid
                  data={heatmap}
                  streak={overview.streak}
                  weekActivity={overview.week_activity}
                  animKey={animKey}
                />
              }
              knowledgeSlot={
                <KnowledgePanel
                  domains={overview.domains}
                  tags={overview.top_tags}
                  animKey={animKey}
                  onSwitchToEditor={onSwitchToEditor}
                />
              }
              linksSlot={
                <DomainLinksTile
                  links={domainLinks}
                  animKey={animKey}
                  onSwitchToEditor={onSwitchToEditor}
                />
              }
            />
          )}
        </div>
      </div>
    </AppShell>
  )
}
