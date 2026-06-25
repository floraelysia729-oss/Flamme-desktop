import { useState, useEffect, useRef } from 'react'
import Layout from './shell/Layout'
import DashboardPage from './dashboard/DashboardPage'
import SettingsPanel from './settings/SettingsPanel'
import IngestBanner from './shell/IngestBanner'
import LaunchScreen from './shell/LaunchScreen'
import WelcomeVaultDialog from './shell/WelcomeVaultDialog'
import { bootDesktop, type BootPhase } from './api/bootDesktop'
import { isTauriWebView } from './api/tauri-runtime'
import { useWorkspaceStore } from './shared/workspaceStore'
import { useChatStore } from './chat/store'
import { useIngestStore } from './ingest/store'
import ThemeBackground from './theme/ThemeBackground'
import { ThemeProvider, useTheme } from './theme/ThemeContext'
import { useConnectionStore } from './api/connection'
import { useVaultStore } from './vault/store'
import { useVaultUiStore } from './vault/vaultUiStore'
import { useVaultFsSync } from './vault/useVaultFsSync'
import { isVaultMode } from './files'
import { useEditorSplitStore } from './editor/editorSplitStore'
import { adjustFontScale, resetFontScale } from './shared/fontScale'

declare const __FEATURE_TAURI__: boolean

type View = 'editor' | 'dashboard'

const WELCOME_DISMISS_KEY = 'flamme-welcome-dismissed'

function AppContent() {
  const [view, setView] = useState<View>('editor')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [bootPhase, setBootPhase] = useState<BootPhase>(
    __FEATURE_TAURI__ && isTauriWebView() ? 'tauri' : 'done',
  )
  const [bootError, setBootError] = useState<string | undefined>()
  const [welcomeOpen, setWelcomeOpen] = useState(false)
  const setWorkspaceMode = useWorkspaceStore((s) => s.setMode)
  const toggleChatWorkspace = useWorkspaceStore((s) => s.toggleChatWorkspace)
  const cycleWorkspaceMode = useWorkspaceStore((s) => s.cycleMode)
  const toggleSidebar = useWorkspaceStore((s) => s.toggleSidebar)
  const vaultPath = useConnectionStore((s) => s.vaultPath)
  const { visualTheme, colorMode, cycleVisualTheme } = useTheme()
  useVaultFsSync()

  const bootRunRef = useRef(0)

  const booting = bootPhase !== 'done' && bootPhase !== 'error'

  const runBoot = () => {
    const runId = ++bootRunRef.current
    const isActive = () => bootRunRef.current === runId

    setBootError(undefined)
    setBootPhase('tauri')
    void bootDesktop((phase, detail) => {
      if (!isActive()) return
      setBootPhase(phase)
      if (phase === 'error') setBootError(detail)
    }).then((res) => {
      if (!isActive()) return
      if (res.ok) {
        setBootPhase('done')
        const path = useConnectionStore.getState().vaultPath.trim()
        let dismissed = false
        try {
          dismissed = localStorage.getItem(WELCOME_DISMISS_KEY) === '1'
        } catch {
          /* ignore */
        }
        if (!path && !dismissed) setWelcomeOpen(true)
      } else {
        setBootPhase('error')
        setBootError(res.error)
      }
    })
  }

  useEffect(() => {
    if (!__FEATURE_TAURI__ || !isTauriWebView()) return
    runBoot()
  }, [])

  const goTo = (next: View) => {
    setSettingsOpen(false)
    setWorkspaceMode('read')
    setView(next)
  }

  useEffect(() => {
    if (!isVaultMode() || booting) return
    const path = vaultPath.trim()
    if (!path) return
    void (async () => {
      try {
        await useVaultStore.getState().initFromVaultPath(path)
      } catch (e) {
        console.warn('[vault] initFromVaultPath:', e)
      }
    })()
  }, [vaultPath, booting])

  useEffect(() => {
    void useIngestStore.persist.rehydrate()
    void useVaultUiStore.persist.rehydrate()
    void useEditorSplitStore.persist.rehydrate()
  }, [])

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useIngestStore.getState().job.status === 'running') {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault()
        setSettingsOpen(false)
        setWorkspaceMode('read')
        setView((v) => (v === 'editor' ? 'dashboard' : 'editor'))
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault()
        if (view === 'editor') toggleSidebar()
        return
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        (e.key === '\\' || e.code === 'Backslash')
      ) {
        e.preventDefault()
        if (view === 'editor') useEditorSplitStore.getState().splitRight()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault()
        if (view === 'editor') cycleWorkspaceMode()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'L') {
        e.preventDefault()
        if (view === 'editor') cycleWorkspaceMode()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 't') {
        e.preventDefault()
        if (e.shiftKey) {
          setSettingsOpen((o) => !o)
        } else {
          cycleVisualTheme()
        }
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'm' || e.key === 'M')) {
        e.preventDefault()
        if (view === 'editor') {
          toggleChatWorkspace(useChatStore.getState().mode)
        }
        return
      }
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault()
          adjustFontScale(1)
          return
        }
        if (e.key === '-' || e.key === '_') {
          e.preventDefault()
          adjustFontScale(-1)
          return
        }
        if (e.key === '0') {
          e.preventDefault()
          resetFontScale()
        }
      }
    }
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      adjustFontScale(e.deltaY < 0 ? 1 : -1)
    }
    window.addEventListener('keydown', handler)
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      window.removeEventListener('keydown', handler)
      window.removeEventListener('wheel', onWheel)
    }
  }, [cycleVisualTheme, view, setWorkspaceMode, toggleChatWorkspace, cycleWorkspaceMode, toggleSidebar])

  const rootClass = [
    colorMode === 'dark' ? 'dark' : '',
    'h-screen',
    `theme-${visualTheme}`,
  ]
    .filter(Boolean)
    .join(' ')

  const browserOnlyTauriBuild =
    __FEATURE_TAURI__ && !isTauriWebView()

  return (
    <div className={rootClass}>
      <ThemeBackground />

      {browserOnlyTauriBuild && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-[#F5F0EB] p-6">
          <div className="max-w-md text-center space-y-3 text-sm text-[#5C4A3A]">
            <p className="font-semibold text-base">请勿在 Chrome 中直接打开 localhost:5173</p>
            <p>
              当前是 Tauri 开发构建，Python AI 引擎由桌面壳自动启动。请关闭此标签页，在终端执行{' '}
              <code className="px-1 rounded bg-black/5">pnpm run tauri:dev</code>，使用弹出的
              FLAMME 桌面窗口。
            </p>
            <p className="text-xs opacity-80">
              若尚未配置后端，请先在 flamme-4 目录执行{' '}
              <code className="px-1 rounded bg-black/5">pnpm run setup:backend</code>
            </p>
          </div>
        </div>
      )}

      {booting && <LaunchScreen phase={bootPhase} detail={bootError} error={bootError} />}
      {bootPhase === 'error' && !booting && (
        <LaunchScreen
          phase="error"
          error={bootError ?? '启动失败'}
          onRetry={runBoot}
        />
      )}

      {!booting && bootPhase !== 'error' && (
        <>
          {view === 'editor' ? (
            <Layout
              onSwitchToDashboard={() => goTo('dashboard')}
              onThemeCycle={cycleVisualTheme}
              onOpenSettings={() => setSettingsOpen((o) => !o)}
            />
          ) : (
            <DashboardPage
              onBack={() => goTo('editor')}
              onSwitchToEditor={() => goTo('editor')}
              onThemeCycle={cycleVisualTheme}
              onOpenSettings={() => setSettingsOpen((o) => !o)}
            />
          )}
        </>
      )}

      <WelcomeVaultDialog
        open={welcomeOpen}
        onClose={() => {
          try {
            localStorage.setItem(WELCOME_DISMISS_KEY, '1')
          } catch {
            /* ignore */
          }
          setWelcomeOpen(false)
        }}
      />
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <IngestBanner />
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  )
}
