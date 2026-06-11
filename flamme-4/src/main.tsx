import { createRoot } from 'react-dom/client'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.min.css'
import './index.css'
import App from './App'
import { mark } from './shared/profiling'
import { registerLocalFs } from './api/bridge'
import { isTauriWebView } from './api/tauri-runtime'
import { browserFsAdapter } from './api/browser-fs'
import { tauriFsAdapter } from './api/tauri-fs'

registerLocalFs(__FEATURE_TAURI__ ? tauriFsAdapter : browserFsAdapter)

/** 桌面端启动流程由 App bootDesktop 统一处理 */
if (__FEATURE_TAURI__ && !isTauriWebView()) {
  console.warn(
    '[flamme] 检测到 Tauri 构建，但当前在普通浏览器中打开。请使用 npm run tauri:dev 启动桌面版。',
  )
}

mark('react_entry')
createRoot(document.getElementById('root')!).render(<App />)
