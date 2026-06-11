/** 启动阶段文案 */
export type BootPhase = 'tauri' | 'backend' | 'vault' | 'done' | 'error'

export const BOOT_PHASE_LABEL: Record<BootPhase, string> = {
  tauri: '正在连接桌面服务…',
  backend: '正在启动 AI 引擎…',
  vault: '正在加载笔记库…',
  done: '就绪',
  error: '启动遇到问题',
}

export interface BootResult {
  ok: boolean
  error?: string
}

declare const __FEATURE_TAURI__: boolean

/**
 * Tauri 桌面端一键启动：等待 IPC → Python sidecar → 恢复已保存的 Vault。
 * 浏览器 dev 模式立即返回 ok。
 */
export async function bootDesktop(
  onPhase?: (phase: BootPhase, detail?: string) => void,
): Promise<BootResult> {
  if (typeof __FEATURE_TAURI__ === 'undefined' || !__FEATURE_TAURI__) {
    onPhase?.('done')
    return { ok: true }
  }

  const { isTauriWebView, waitForTauriReady } = await import('./tauri-runtime')
  if (!isTauriWebView()) {
    onPhase?.('done')
    return { ok: true }
  }

  onPhase?.('tauri')
  const tauriOk = await waitForTauriReady(20_000)
  if (!tauriOk) {
    const err = '桌面服务未就绪，请重启应用'
    onPhase?.('error', err)
    return { ok: false, error: err }
  }

  onPhase?.('backend')
  const { waitForPythonSidecar } = await import('./bridge')
  const backendOk = await waitForPythonSidecar(90_000)
  if (!backendOk) {
    const { getSidecarStatus } = await import('./bridge')
    const st = await getSidecarStatus()
    const logHint = st?.log_file
      ? `日志：${st.log_file}`
      : '日志：%APPDATA%\\com.llmwiki.flamme4\\logs\\flamme-api.log'
    const err = `AI 引擎未能启动（90 秒内未响应）。${logHint}`
    onPhase?.('error', err)
    return { ok: false, error: err }
  }

  onPhase?.('vault')
  const { useConnectionStore } = await import('./connection')
  const { isVaultMode } = await import('../files')
  const vaultPath = useConnectionStore.getState().vaultPath.trim()
  if (vaultPath && isVaultMode()) {
    try {
      const { useVaultStore } = await import('../vault/store')
      await useVaultStore.getState().initFromVaultPath(vaultPath)
    } catch (e) {
      console.warn('[boot] vault init:', e)
    }
  }

  onPhase?.('done')
  return { ok: true }
}
