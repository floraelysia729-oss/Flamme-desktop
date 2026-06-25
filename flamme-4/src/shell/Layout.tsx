import { lazy, Suspense, useCallback, useState } from 'react'
import { useTheme } from '../theme/ThemeContext'
import { useWorkspaceStore } from '../shared/workspaceStore'
import AppShell from './AppShell'
import Toolbar from './Toolbar'
import Sidebar from './Sidebar'
import SidebarRail from './SidebarRail'
import EditorWorkspace from '../editor/EditorWorkspace'
import ResizableChatAside, { loadChatPanelWidth } from '../chat/ResizableChatAside'

const ChatPanel = lazy(() => import('../chat/ChatPanel'))

interface LayoutProps {
  onSwitchToDashboard: () => void
  onThemeCycle: () => void
  onOpenSettings: () => void
}

function ChatSuspense({ onClose }: { onClose: () => void }) {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center text-sm text-[var(--ink-muted-on-glass,var(--ink-muted))]">
          加载对话…
        </div>
      }
    >
      <ChatPanel onClose={onClose} />
    </Suspense>
  )
}

export default function Layout({ onSwitchToDashboard, onThemeCycle, onOpenSettings }: LayoutProps) {
  const { glass } = useTheme()
  const mode = useWorkspaceStore((s) => s.mode)
  const sidebarCollapsed = useWorkspaceStore((s) => s.sidebarCollapsed)
  const setMode = useWorkspaceStore((s) => s.setMode)
  const [chatWidth, setChatWidth] = useState(loadChatPanelWidth)
  const onChatWidthChange = useCallback((w: number) => setChatWidth(w), [])

  const handleCloseChat = useCallback(() => setMode('read'), [setMode])

  return (
    <AppShell variant="editor">
      <aside
        className={`${sidebarCollapsed ? 'w-10' : 'w-44'} shrink-0 flex flex-col m-1 mr-0 min-h-0 transition-[width] duration-200`}
      >
        <div className={`${glass.card} flex flex-col flex-1 min-h-0 overflow-hidden rounded-xl`}>
          {sidebarCollapsed ? <SidebarRail /> : <Sidebar />}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 min-h-0 m-1 ml-0.5 gap-1">
        <Toolbar
          onSwitchToDashboard={onSwitchToDashboard}
          onThemeCycle={onThemeCycle}
          onOpenSettings={onOpenSettings}
        />
        <div className="flex flex-1 min-h-0 min-w-0 gap-1 overflow-hidden">
          <div
            className={`${glass.card} flex-1 min-h-0 min-w-0 basis-0 overflow-hidden rounded-xl editor-surface ${
              mode === 'chat' ? 'hidden' : ''
            }`}
          >
            <EditorWorkspace />
          </div>
          {mode === 'chat' ? (
            <div
              className={`${glass.card} flex-1 min-h-0 min-w-0 overflow-hidden rounded-xl editor-surface`}
            >
              <ChatSuspense key="chat-panel" onClose={handleCloseChat} />
            </div>
          ) : (
            mode === 'split' && (
              <ResizableChatAside width={chatWidth} onWidthChange={onChatWidthChange}>
                <ChatSuspense key="chat-panel" onClose={handleCloseChat} />
              </ResizableChatAside>
            )
          )}
        </div>
      </div>
    </AppShell>
  )
}
